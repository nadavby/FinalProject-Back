import axios from 'axios';
import { IItem } from '../models/item_model';

// Dynamic import approach to handle OpenCV
let cv: any;
try {
  // In a Node.js environment, OpenCV might be imported differently
  // This is a placeholder for the actual import mechanism that would be used
  // cv = require('opencv-wasm');
  console.log('OpenCV import attempted');
} catch (error) {
  console.warn('OpenCV not available:', error);
}

// Add image analysis cache
interface AnalysisCache {
  [imageUrl: string]: {
    timestamp: number;
    data: ImageData;
  };
}

interface VisionApiResponse {
  responses: Array<{
    localizedObjectAnnotations?: Array<{
      name: string;
      score: number;
      boundingPoly: {
        normalizedVertices: Array<{
          x: number;
          y: number;
        }>;
      };
    }>;
    labelAnnotations?: Array<{
      description: string;
      score: number;
    }>;
  }>;
}

interface ImageData {
  labels: string[];
  objects: Array<{
    name: string;
    score: number;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
}

interface ComparisonResult {
  isMatch: boolean;
  score: number;
  matchedObjects: Array<{
    objectName: string;
    similarityScore: number;
  }>;
}

export class ImageComparisonService {
  private apiKey: string;
  private cvInitialized: boolean;
  private analysisCache: AnalysisCache;
  private cacheExpirationMs: number;

  constructor() {
    this.apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY || '';
    this.cvInitialized = false;
    this.analysisCache = {};
    this.cacheExpirationMs = 1000 * 60 * 60 * 24; // 24 hours cache expiration
    this.initializeOpenCV();
  }

  private async initializeOpenCV(): Promise<void> {
    try {
      if (cv && typeof cv.getBuildInformation === 'function') {
        this.cvInitialized = true;
        console.log('OpenCV initialized successfully');
      } else {
        console.error('OpenCV initialization failed');
      }
    } catch (error) {
      console.error('Error initializing OpenCV:', error);
    }
  }

  /**
   * Analyzes an image using Google Cloud Vision API with caching
   * @param imageUrl URL of the image to analyze
   * @returns Object detection and label data
   */
  public async analyzeImage(imageUrl: string): Promise<ImageData> {
    // Check if we have a valid cached result
    const cachedResult = this.analysisCache[imageUrl];
    const now = Date.now();
    
    if (cachedResult && (now - cachedResult.timestamp) < this.cacheExpirationMs) {
      console.log(`Using cached analysis for ${imageUrl}`);
      return cachedResult.data;
    }

    if (!this.apiKey) {
      console.warn('Google Cloud Vision API key not set');
      return { labels: [], objects: [] };
    }

    try {
      console.log(`Analyzing image with Vision API: ${imageUrl}`);
      const apiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`;
      
      const requestData = {
        requests: [
          {
            image: {
              source: {
                imageUri: imageUrl
              }
            },
            features: [
              { type: "LABEL_DETECTION", maxResults: 10 },
              { type: "OBJECT_LOCALIZATION", maxResults: 10 }
            ]
          }
        ]
      };

      const response = await axios.post<VisionApiResponse>(apiUrl, requestData);
      const result = response.data.responses[0];
      
      const analysisResult = {
        labels: result.labelAnnotations?.map(label => label.description) || [],
        objects: result.localizedObjectAnnotations?.map(obj => ({
          name: obj.name,
          score: obj.score,
          boundingBox: {
            x: obj.boundingPoly.normalizedVertices[0]?.x || 0,
            y: obj.boundingPoly.normalizedVertices[0]?.y || 0,
            width: (obj.boundingPoly.normalizedVertices[2]?.x || 0) - (obj.boundingPoly.normalizedVertices[0]?.x || 0),
            height: (obj.boundingPoly.normalizedVertices[2]?.y || 0) - (obj.boundingPoly.normalizedVertices[0]?.y || 0)
          }
        })) || []
      };

      // Cache the result
      this.analysisCache[imageUrl] = {
        timestamp: now,
        data: analysisResult
      };
      
      console.log(`Cached analysis result for ${imageUrl}`);
      return analysisResult;
    } catch (error) {
      console.error('Error analyzing image with Vision API:', error);
      return { labels: [], objects: [] };
    }
  }

  /**
   * Compare two images to determine if they contain the same object
   * @param image1Url URL of the first image
   * @param image2Url URL of the second image
   * @returns Comparison result with match status and score
   */
  public async compareImages(image1Url: string, image2Url: string): Promise<ComparisonResult> {
    try {
      // 1. Analyze both images with Google Cloud Vision API
      const [image1Data, image2Data] = await Promise.all([
        this.analyzeImage(image1Url),
        this.analyzeImage(image2Url)
      ]);

      // 2. Compare labels for initial filtering
      const commonLabels = image1Data.labels.filter(label => 
        image2Data.labels.includes(label)
      );

      if (commonLabels.length === 0) {
        // If no common labels, items are likely different
        return {
          isMatch: false,
          score: 0,
          matchedObjects: []
        };
      }

      // 3. Compare objects
      const matchedObjects = [];
      let totalScore = 0;

      for (const obj1 of image1Data.objects) {
        for (const obj2 of image2Data.objects) {
          // If objects have the same label, compare their features
          if (obj1.name.toLowerCase() === obj2.name.toLowerCase()) {
            // Calculate basic score from object detection confidence
            const objectScore = (obj1.score + obj2.score) / 2;
            
            // If OpenCV is initialized, we would enhance this with feature matching
            // For now, use a basic similarity score based on detection confidence
            matchedObjects.push({
              objectName: obj1.name,
              similarityScore: objectScore * 100
            });
            
            totalScore += objectScore;
          }
        }
      }

      // Calculate final score and determine if it's a match
      const finalScore = matchedObjects.length > 0 
        ? (totalScore / matchedObjects.length) * 100 
        : 0;
      
      return {
        isMatch: finalScore > 60, // Consider it a match if score > 60%
        score: finalScore,
        matchedObjects
      };
    } catch (error) {
      console.error('Error comparing images:', error);
      return {
        isMatch: false,
        score: 0,
        matchedObjects: []
      };
    }
  }

  /**
   * Compare a newly uploaded item with existing items to find matches
   * @param newItem The newly uploaded item
   * @param existingItems Array of existing items to compare against
   * @returns Array of matches with similarity scores
   */
  public async findMatchesForItem(
    newItem: IItem, 
    existingItems: IItem[]
  ): Promise<Array<{ item: IItem, score: number }>> {
    if (!newItem.imageUrl) {
      return [];
    }

    const matches = [];

    for (const existingItem of existingItems) {
      if (!existingItem.imageUrl || existingItem._id === newItem._id) {
        continue;
      }

      try {
        const comparisonResult = await this.compareImages(
          newItem.imageUrl,
          existingItem.imageUrl
        );

        if (comparisonResult.score > 50) {
          matches.push({
            item: existingItem,
            score: comparisonResult.score
          });
        }
      } catch (error) {
        console.error(`Error comparing with item ${existingItem._id}:`, error);
      }
    }

    // Sort matches by score in descending order
    return matches.sort((a, b) => b.score - a.score);
  }
}

export default new ImageComparisonService(); 