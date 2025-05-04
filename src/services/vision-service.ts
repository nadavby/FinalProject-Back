import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface VisionLabel {
  description: string;
  score: number;
}

interface VisionObject {
  name: string;
  score: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface ImageAnalysisResult {
  labels: VisionLabel[];
  objects: VisionObject[];
}

interface VisionComparisonDetails {
  labelSimilarity: number;
  objectSimilarity: number;
}

interface AnalysisCache {
  [imageUrl: string]: {
    timestamp: number;
    data: ImageAnalysisResult;
  };
}

interface VisionColor {
  color: {
    red: number;
    green: number;
    blue: number;
  };
  score: number;
}

interface ExtendedImageAnalysisResult extends ImageAnalysisResult {
  dominantColors?: Array<{
    red: number;
    green: number;
    blue: number;
    score: number;
  }>;
  positioning?: {
    confidence: number;
    importanceFraction: number;
  };
}

class VisionService {
  private apiKey: string;
  private analysisCache: AnalysisCache;
  private cacheExpirationMs: number;
  
  constructor() {
    this.apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY || '';
    if (!this.apiKey) {
      console.error('GOOGLE_CLOUD_VISION_API_KEY is not set in environment variables');
    }

    this.analysisCache = {};
    this.cacheExpirationMs = 1000 * 60 * 60 * 24; // 24 hours
  }

  private normalizeUrl(url: string): string {
    try {
      let normalizedUrl = url.replace(/\\/g, '/');
      const decodedUrl = decodeURI(normalizedUrl);
      normalizedUrl = encodeURI(decodedUrl);
      return normalizedUrl;
    } catch (error) {
      console.error('Error normalizing URL:', error);
      return url;
    }
  }

  /**
   * Compare two images using Google Cloud Vision API and return similarity score
   */
  async compareImages(
    image1Url: string,
    image2Url: string
  ): Promise<{ similarityScore: number; details?: VisionComparisonDetails }> {
    try {
      // Analyze both images to get their labels and features
      const [image1Data, image2Data] = await Promise.all([
        this.analyzeImage(image1Url),
        this.analyzeImage(image2Url)
      ]);

      if (!image1Data || !image2Data) {
        return { similarityScore: 0 };
      }

      // Calculate similarity based on labels and objects
      const labelSimilarity = this.calculateLabelSimilarity(
        image1Data.labels || [],
        image2Data.labels || []
      );

      const objectSimilarity = this.calculateObjectSimilarity(
        image1Data.objects || [],
        image2Data.objects || []
      );

      // Weighted similarity score (50% labels, 50% objects)
      const weightedScore = (
        labelSimilarity * 0.5 +
        objectSimilarity * 0.5
      ) * 100;

      return {
        similarityScore: Math.round(weightedScore),
        details: {
          labelSimilarity,
          objectSimilarity
        }
      };
    } catch (error) {
      console.error('Error comparing images:', error);
      return { similarityScore: 0 };
    }
  }

  /**
   * Get analysis data for a single image
   */
  public async getImageAnalysis(imageUrl: string): Promise<{
    labels: string[];
    objects: VisionObject[];
  }> {
    try {
      const analysisResult = await this.analyzeImage(imageUrl);
      
      if (!analysisResult) {
        return { labels: [], objects: [] };
      }
      
      return {
        labels: analysisResult.labels.map(label => label.description),
        objects: analysisResult.objects
      };
    } catch (error) {
      console.error('Error getting image analysis:', error);
      return { labels: [], objects: [] };
    }
  }

  /**
   * Analyze image using Google Cloud Vision API to extract features
   */
  private async analyzeImage(imageUrl: string): Promise<ImageAnalysisResult | null> {
    const normalizedUrl = this.normalizeUrl(imageUrl);
    
    // Check cache first
    const cachedResult = this.analysisCache[normalizedUrl];
    const now = Date.now();
    
    if (cachedResult && (now - cachedResult.timestamp) < this.cacheExpirationMs) {
      return cachedResult.data;
    }

    if (!this.apiKey) {
      console.error('Cannot analyze image: API key is not configured');
      return null;
    }

    try {
      let imageContent: string;

      // Handle local files for development
      if (normalizedUrl.startsWith('http://localhost')) {
        const publicIndex = normalizedUrl.indexOf('/public/');
        if (publicIndex !== -1) {
          const imagePath = path.join(
            process.cwd(),
            'public',
            decodeURIComponent(normalizedUrl.slice(publicIndex + '/public/'.length))
          );
          
          try {
            const imageBuffer = fs.readFileSync(imagePath);
            imageContent = imageBuffer.toString('base64');
          } catch (error) {
            console.error('Error reading local image file:', error);
            throw new Error('Failed to read local image file');
          }
        } else {
          throw new Error('Invalid local file path');
        }
      } else {
        // Download image from URL
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        imageContent = Buffer.from(response.data, 'base64').toString('base64');
      }

      // Format request for Vision API
      const requestBody = {
        requests: [{
          image: {
            content: imageContent
          },
          features: [
            { 
              type: 'LABEL_DETECTION',
              maxResults: 20,  // Increased from 15
              model: 'builtin/latest'
            },
            { 
              type: 'OBJECT_LOCALIZATION',
              maxResults: 20,  // Increased from 15
              model: 'builtin/latest'
            },
            {
              type: 'IMAGE_PROPERTIES',  // Added to get color information
              maxResults: 20
            },
            {
              type: 'CROP_HINTS'  // Added to get object positioning
            }
          ],
          imageContext: {
            languageHints: ['en'],  // Ensure English labels
            cropHintsParams: {
              aspectRatios: [1.0]  // Square crop for consistent object detection
            }
          }
        }]
      };

      const response = await axios.post(
        'https://vision.googleapis.com/v1/images:annotate',
        requestBody,
        {
          params: {
            key: this.apiKey
          },
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000  // Increased timeout for more detailed analysis
        }
      );

      if (!response.data?.responses?.[0]) {
        throw new Error('Invalid response from Vision API');
      }

      const result = response.data.responses[0];

      // Extract relevant data with enhanced information
      const analysisResult: ExtendedImageAnalysisResult = {
        labels: (result.labelAnnotations || []).map((label: { description: string; score: number; topicality?: number }) => ({
          description: label.description,
          score: Math.max(label.score || 0, label.topicality || 0)
        })),
        objects: (result.localizedObjectAnnotations || []).map((obj: { 
          name: string; 
          score: number; 
          boundingPoly?: {
            normalizedVertices: Array<{ x: number; y: number; }>
          }
        }) => ({
          name: obj.name,
          score: obj.score,
          boundingBox: obj.boundingPoly ? {
            x: obj.boundingPoly.normalizedVertices[0]?.x || 0,
            y: obj.boundingPoly.normalizedVertices[0]?.y || 0,
            width: Math.abs((obj.boundingPoly.normalizedVertices[1]?.x || 0) - (obj.boundingPoly.normalizedVertices[0]?.x || 0)),
            height: Math.abs((obj.boundingPoly.normalizedVertices[2]?.y || 0) - (obj.boundingPoly.normalizedVertices[0]?.y || 0))
          } : undefined
        }))
      };

      // Add dominant colors if available
      if (result.imagePropertiesAnnotation?.dominantColors?.colors) {
        const dominantColors = result.imagePropertiesAnnotation.dominantColors.colors
          .sort((a: VisionColor, b: VisionColor) => b.score - a.score)
          .slice(0, 5)
          .map((color: VisionColor) => ({
            red: color.color.red,
            green: color.color.green,
            blue: color.color.blue,
            score: color.score
          }));
        analysisResult.dominantColors = dominantColors;
      }

      // Add positioning information if available
      if (result.cropHintsAnnotation?.cropHints?.[0]) {
        analysisResult.positioning = {
          confidence: result.cropHintsAnnotation.cropHints[0].confidence,
          importanceFraction: result.cropHintsAnnotation.cropHints[0].importanceFraction
        };
      }

      // Cache the result
      this.analysisCache[normalizedUrl] = {
        timestamp: now,
        data: analysisResult
      };

      return analysisResult;
    } catch (error) {
      this.handleVisionApiError(error);
      return null;
    }
  }

  /**
   * Handle Vision API errors
   */
  private handleVisionApiError(error: unknown): void {
    console.error('=== Vision API Error Details ===');
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      
      console.error('Response Status:', status);
      console.error('Response Data:', data);
      
      switch (status) {
        case 403:
          console.error('Authentication failed. Check API key and permissions.');
          break;
        case 400:
          console.error('Bad request. The image may be invalid or too large');
          break;
        case 429:
          console.error('Rate limit exceeded. Please try again later');
          break;
        default:
          console.error(`API request failed with status ${status}`);
      }
    } else {
      console.error('Unknown error occurred:', error);
    }
  }

  /**
   * Calculate similarity between two sets of labels
   */
  private calculateLabelSimilarity(labels1: VisionLabel[], labels2: VisionLabel[]): number {
    if (!labels1.length || !labels2.length) return 0;

    const matchCount = labels1.reduce((count, label1) => {
      const match = labels2.find(
        label2 => 
          label2.description.toLowerCase() === label1.description.toLowerCase() ||
          label2.description.toLowerCase().includes(label1.description.toLowerCase()) ||
          label1.description.toLowerCase().includes(label2.description.toLowerCase())
      );
      return match ? count + (label1.score * match.score) : count;
    }, 0);

    return matchCount / Math.min(labels1.length, labels2.length);
  }

  /**
   * Calculate similarity between two sets of objects
   */
  private calculateObjectSimilarity(objects1: VisionObject[], objects2: VisionObject[]): number {
    if (!objects1.length || !objects2.length) return 0;

    const matchCount = objects1.reduce((count, obj1) => {
      const match = objects2.find(
        obj2 => 
          obj2.name.toLowerCase() === obj1.name.toLowerCase() ||
          obj2.name.toLowerCase().includes(obj1.name.toLowerCase()) ||
          obj1.name.toLowerCase().includes(obj2.name.toLowerCase())
      );
      return match ? count + (obj1.score * match.score) : count;
    }, 0);

    return matchCount / Math.min(objects1.length, objects2.length);
  }
}

// Create singleton instance
const visionService = new VisionService();

export default visionService; 