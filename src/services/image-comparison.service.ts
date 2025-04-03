import axios from 'axios';
import { IItem } from '../models/item_model';
import fs from 'fs';
import path from 'path';

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
    webDetection?: {
      webEntities?: Array<{
        description: string;
        score: number;
      }>;
      bestGuessLabels?: Array<{
        label: string;
        languageCode: string;
      }>;
    };
    imagePropertiesAnnotation?: {
      dominantColors?: {
        colors: Array<{
          color: {
            red: number;
            green: number;
            blue: number;
          };
          score: number;
          pixelFraction: number;
        }>;
      };
    };
    safeSearchAnnotation?: {
      adult: string;
      spoof: string;
      medical: string;
      violence: string;
      racy: string;
    };
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
  webEntities: string[];
  bestGuessLabels: string[];
  dominantColors: Array<{
    color: {
      red: number;
      green: number;
      blue: number;
    };
    score: number;
    pixelFraction: number;
  }>;
  safeSearch?: {
    adult: string;
    spoof: string;
    medical: string;
    violence: string;
    racy: string;
  };
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
    // Load API key and validate it
    this.apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY || '';
    if (!this.apiKey) {
      console.error('GOOGLE_CLOUD_VISION_API_KEY is not set in environment variables');
    } else if (this.apiKey === 'your_google_cloud_vision_api_key') {
      console.error('GOOGLE_CLOUD_VISION_API_KEY is set to placeholder value');
      this.apiKey = '';
    } else {
      console.log('Google Cloud Vision API key loaded successfully');
    }

    this.cvInitialized = false;
    this.analysisCache = {};
    this.cacheExpirationMs = 1000 * 60 * 60 * 24; // 24 hours cache expiration
    this.initializeOpenCV();
  }

  private async initializeOpenCV(): Promise<void> {
    try {
      console.log('Attempting to initialize OpenCV...');
      if (cv && typeof cv.getBuildInformation === 'function') {
        this.cvInitialized = true;
        console.log('OpenCV initialized successfully');
      } else {
        console.error('OpenCV initialization failed: cv object or getBuildInformation not available');
        this.cvInitialized = false;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error initializing OpenCV:', errorMessage);
      this.cvInitialized = false;
    }
  }

  /**
   * Normalizes a URL by replacing backslashes with forward slashes and ensuring proper encoding
   * @param url The URL to normalize
   * @returns Normalized URL
   */
  private normalizeUrl(url: string): string {
    try {
      // Replace backslashes with forward slashes
      let normalizedUrl = url.replace(/\\/g, '/');
      
      // Ensure the URL is properly encoded
      // First decode to handle any existing encoding
      const decodedUrl = decodeURI(normalizedUrl);
      // Then encode it properly
      normalizedUrl = encodeURI(decodedUrl);
      
      console.log(`Normalized URL from ${url} to ${normalizedUrl}`);
      return normalizedUrl;
    } catch (error) {
      console.error('Error normalizing URL:', error);
      // If there's an error in normalization, return the original URL
      return url;
    }
  }

  /**
   * Analyzes an image using Google Cloud Vision API with caching
   * @param imageUrl URL of the image to analyze
   * @returns Object detection and label data
   */
  public async analyzeImage(imageUrl: string): Promise<ImageData> {
    // Normalize the URL before processing
    const normalizedUrl = this.normalizeUrl(imageUrl);
    console.log('\n=== Vision API Request Details ===');
    console.log('Original URL:', imageUrl);
    console.log('Normalized URL:', normalizedUrl);
    
    // Check cache first
    const cachedResult = this.analysisCache[normalizedUrl];
    const now = Date.now();
    
    if (cachedResult && (now - cachedResult.timestamp) < this.cacheExpirationMs) {
      console.log('Using cached analysis for:', normalizedUrl);
      return cachedResult.data;
    }

    if (!this.apiKey) {
      console.error('Google Cloud Vision API key not set or invalid');
      return { labels: [], objects: [], webEntities: [], bestGuessLabels: [], dominantColors: [], safeSearch: undefined };
    }

    try {
      // Extract the file path from the URL and read the file
      let filePath: string;
      
      try {
        // Try to parse as a URL first
        const urlPath = new URL(normalizedUrl).pathname;
        filePath = path.join(process.cwd(), urlPath.replace(/^\//, ''));
      } catch (e) {
        // If not a valid URL, try to use the normalized URL directly as a path
        console.log('URL parsing failed, using normalized URL as path');
        filePath = normalizedUrl;
      }
      
      console.log('Reading file from:', filePath);

      // Read the file and convert to base64
      let imageBuffer: Buffer;
      try {
        imageBuffer = await fs.promises.readFile(filePath);
        console.log(`Successfully read image file (${imageBuffer.length} bytes)`);
      } catch (err) {
        console.error('Error reading image file:', err);
        console.log('Attempting fallback direct read from URL path...');
        
        // Fallback approach - try a simpler path parsing
        const simplePath = normalizedUrl.replace(/^https?:\/\/[^\/]+\//, '');
        const fallbackPath = path.join(process.cwd(), simplePath);
        console.log('Fallback path:', fallbackPath);
        
        imageBuffer = await fs.promises.readFile(fallbackPath);
        console.log(`Successfully read image file using fallback path (${imageBuffer.length} bytes)`);
      }
      
      const imageContent = imageBuffer.toString('base64');
      console.log(`Converted image to base64 (length: ${imageContent.length})`);

      console.log('Sending Vision API request...');
      const apiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`;
      
      const requestData = {
        requests: [{
          image: {
            content: imageContent
          },
          features: [
            { type: "LABEL_DETECTION", maxResults: 20 },
            { type: "OBJECT_LOCALIZATION", maxResults: 15 },
            { type: "WEB_DETECTION", maxResults: 15 },
            { type: "IMAGE_PROPERTIES", maxResults: 5 },
            { type: "SAFE_SEARCH_DETECTION" }
          ]
        }]
      };

      console.log('Vision API request data:', JSON.stringify({
        ...requestData,
        requests: [{
          ...requestData.requests[0],
          image: { content: 'BASE64_CONTENT_REDACTED' }
        }]
      }, null, 2));

      console.log('Sending API request to:', apiUrl);
      console.log('Using request headers:', {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Referer': process.env.DOMAIN_BASE || 'http://localhost:3000',
        'Origin': process.env.DOMAIN_BASE || 'http://localhost:3000'
      });
      
      try {
        const response = await axios.post<VisionApiResponse>(apiUrl, requestData, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Referer': process.env.DOMAIN_BASE || 'http://localhost:3000',
            'Origin': process.env.DOMAIN_BASE || 'http://localhost:3000'
          }
        });

        console.log('Vision API response status:', response.status);
        console.log('Vision API response headers:', JSON.stringify(response.headers, null, 2));
        
        if (!response.data.responses || response.data.responses.length === 0) {
          console.error('Empty response from Vision API');
          return { labels: [], objects: [], webEntities: [], bestGuessLabels: [], dominantColors: [], safeSearch: undefined };
        }

        const result = response.data.responses[0];
        console.log('Vision API response data:', JSON.stringify(result, null, 2));

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
          })) || [],
          webEntities: result.webDetection?.webEntities?.map(entity => entity.description) || [],
          bestGuessLabels: result.webDetection?.bestGuessLabels?.map(label => label.label) || [],
          dominantColors: result.imagePropertiesAnnotation?.dominantColors?.colors.map(color => ({
            color: {
              red: color.color.red,
              green: color.color.green,
              blue: color.color.blue
            },
            score: color.score,
            pixelFraction: color.pixelFraction
          })) || [],
          safeSearch: result.safeSearchAnnotation
        };

        // Perform post-processing to correct common misidentifications
        this.postProcessAnalysisResult(analysisResult);

        console.log('Final analysis result:', JSON.stringify(analysisResult, null, 2));
        console.log('=== Vision API Request Complete ===\n');

        // Cache the result
        this.analysisCache[normalizedUrl] = {
          timestamp: now,
          data: analysisResult
        };
        
        return analysisResult;
      } catch (innerError) {
        // Re-throw to be caught by the outer try-catch
        throw innerError;
      }
    } catch (error: unknown) {
      console.error('\nError analyzing image with Vision API:', error);
      if (axios.isAxiosError(error)) {
        if (error.response) {
          console.error('Vision API error details:', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            headers: error.response.headers
          });
          
          // Log specific 403 error information
          if (error.response.status === 403) {
            console.error('403 Forbidden error detected. Please verify:');
            console.error('1. Your API key is valid and has Vision API access enabled');
            console.error('2. Your API key has the correct application restrictions');
            console.error('3. Your Referer header matches the allowed domains in Google Cloud Console');
            console.error(`Current Referer: ${process.env.DOMAIN_BASE || 'http://localhost:3000'}`);
          }
        } else if (error.request) {
          console.error('No response received from Vision API:', error.request);
        } else {
          console.error('Error setting up Vision API request:', error.message);
        }
        console.error('Vision API request config:', error.config);
      }
      return { labels: [], objects: [], webEntities: [], bestGuessLabels: [], dominantColors: [], safeSearch: undefined };
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
      console.log(`\n=== Starting image comparison ===`);
      console.log(`Comparing images:\n- Image 1: ${image1Url}\n- Image 2: ${image2Url}`);

      // 1. Analyze both images with Google Cloud Vision API
      console.log('Analyzing both images...');
      const [image1Data, image2Data] = await Promise.all([
        this.analyzeImage(image1Url),
        this.analyzeImage(image2Url)
      ]);

      console.log('\nAnalysis results:');
      console.log('Image 1 analysis:', JSON.stringify(image1Data, null, 2));
      console.log('Image 2 analysis:', JSON.stringify(image2Data, null, 2));
      
      // Categorize the products in both images
      const category1 = this.categorizeProduct(image1Data);
      const category2 = this.categorizeProduct(image2Data);
      
      console.log('\nCategory comparison:');
      console.log(`- Image 1: ${category1.category}${category1.subcategory ? ` (${category1.subcategory})` : ''} (${category1.confidence.toFixed(2)}%)`);
      console.log(`- Image 2: ${category2.category}${category2.subcategory ? ` (${category2.subcategory})` : ''} (${category2.confidence.toFixed(2)}%)`);
      
      const isSameCategory = category1.category === category2.category && category1.category !== 'unknown';
      const isSameSubcategory = category1.subcategory === category2.subcategory && category1.subcategory !== undefined;
      
      if (isSameCategory) {
        console.log(`✓ Same product category: ${category1.category}`);
        if (isSameSubcategory) {
          console.log(`✓ Same product subcategory: ${category1.subcategory}`);
        }
      } else {
        console.log(`✗ Different product categories: ${category1.category} vs ${category2.category}`);
      }
      
      // Compare dominant colors
      const colorComparison = this.compareDominantColors(image1Data.dominantColors, image2Data.dominantColors);
      
      console.log('\nColor comparison:');
      console.log(`- Color similarity score: ${colorComparison.score.toFixed(2)}%`);
      console.log(`- Matching colors: ${colorComparison.matches.length}`);
      
      if (colorComparison.matches.length > 0) {
        console.log('- Color matches:');
        colorComparison.matches.forEach(match => {
          console.log(`  * ${match.color1} ↔ ${match.color2} (${match.similarity.toFixed(2)}%)`);
        });
      }
      
      // Check for electronics-related terms
      const electronics1 = this.identifyElectronicsTerms(image1Data);
      const electronics2 = this.identifyElectronicsTerms(image2Data);
      
      const commonElectronics = electronics1.filter(term => electronics2.includes(term));
      if (commonElectronics.length > 0) {
        console.log('\nCommon electronics terms found:', commonElectronics);
      }

      // 2. Compare labels for initial filtering
      const commonLabels = image1Data.labels.filter(label => 
        image2Data.labels.includes(label)
      );

      console.log('\nCommon labels found:', commonLabels.length);
      if (commonLabels.length > 0) {
        console.log('Labels:', commonLabels);
      }
      
      // Compare web entities for more specific object identification
      const commonWebEntities = image1Data.webEntities.filter(entity => 
        image2Data.webEntities.includes(entity)
      );
      
      console.log('\nCommon web entities found:', commonWebEntities.length);
      if (commonWebEntities.length > 0) {
        console.log('Web Entities:', commonWebEntities);
      }
      
      // Compare best guess labels
      const commonBestGuesses = image1Data.bestGuessLabels.filter(label => 
        image2Data.bestGuessLabels.includes(label)
      );
      
      console.log('\nCommon best guess labels:', commonBestGuesses.length);
      if (commonBestGuesses.length > 0) {
        console.log('Best Guesses:', commonBestGuesses);
      }

      // Check if there's any overlap in identifiers
      if (commonLabels.length === 0 && commonWebEntities.length === 0 && commonBestGuesses.length === 0) {
        console.log('No common identifiers found - items are likely different');
        return {
          isMatch: false,
          score: 0,
          matchedObjects: []
        };
      }

      // 3. Compare objects
      const matchedObjects = [];
      let totalScore = 0;

      // First, add common labels as matched objects with high confidence
      // This is important because labels like "Loudspeaker" are often more accurate than object detection
      for (const label of commonLabels) {
        console.log(`\nAdding label match: ${label}`);
        // Give higher confidence to certain important labels
        const isSpeakerLabel = label.toLowerCase().includes('speaker') || 
                              label.toLowerCase().includes('audio') ||
                              label.toLowerCase() === 'loudspeaker';
        
        const labelScore = isSpeakerLabel ? 0.95 : 0.8; // Prioritize speaker-related labels
        
        matchedObjects.push({
          objectName: label,
          similarityScore: labelScore * 100
        });
        
        totalScore += labelScore;
        
        // Log when we find speaker-related labels to track detection
        if (isSpeakerLabel) {
          console.log(`*** Found speaker-related label: ${label} with high confidence ***`);
        }
      }

      console.log('\nComparing detected objects:');
      console.log('Image 1 objects:', image1Data.objects.map(obj => obj.name));
      console.log('Image 2 objects:', image2Data.objects.map(obj => obj.name));

      // Check for common object names
      for (const obj1 of image1Data.objects) {
        for (const obj2 of image2Data.objects) {
          // If objects have the same label, compare their features
          if (obj1.name.toLowerCase() === obj2.name.toLowerCase()) {
            // Calculate basic score from object detection confidence
            const objectScore = (obj1.score + obj2.score) / 2;
            
            console.log(`\nMatched object: ${obj1.name}`);
            console.log(`- Object 1 confidence: ${obj1.score}`);
            console.log(`- Object 2 confidence: ${obj2.score}`);
            console.log(`- Combined score: ${objectScore * 100}%`);
            
            matchedObjects.push({
              objectName: obj1.name,
              similarityScore: objectScore * 100
            });
            
            totalScore += objectScore;
          }
        }
      }
      
      // If no direct object matches were found, try to use web entities and best guesses
      if (matchedObjects.length === 0 && (commonWebEntities.length > 0 || commonBestGuesses.length > 0 || commonElectronics.length > 0)) {
        console.log('\nUsing web entities and best guesses for matching:');
        
        // Add web entities as matched objects
        for (const entity of commonWebEntities) {
          console.log(`Adding web entity match: ${entity}`);
          matchedObjects.push({
            objectName: entity,
            similarityScore: 70 // Default score for web entity matches
          });
          totalScore += 0.7;
        }
        
        // Add best guesses as matched objects
        for (const label of commonBestGuesses) {
          console.log(`Adding best guess match: ${label}`);
          matchedObjects.push({
            objectName: label,
            similarityScore: 75 // Default score for best guess matches
          });
          totalScore += 0.75;
        }
        
        // Add electronics terms as matched objects with high confidence
        for (const term of commonElectronics) {
          console.log(`Adding electronics term match: ${term}`);
          matchedObjects.push({
            objectName: term,
            similarityScore: 85 // Higher score for electronics-specific matches
          });
          totalScore += 0.85;
        }
      }

      // Apply category matching boost
      let categoryBoost = 0;
      if (isSameCategory) {
        categoryBoost = 0.15; // 15% boost for same category
        console.log(`Adding category match boost: +15%`);
        
        if (isSameSubcategory) {
          categoryBoost += 0.1; // Additional 10% for same subcategory
          console.log(`Adding subcategory match boost: +10%`);
        }
        
        // Add category as a matched object
        matchedObjects.push({
          objectName: `Category: ${category1.category}${category1.subcategory ? ` (${category1.subcategory})` : ''}`,
          similarityScore: 90
        });
        
        totalScore += 0.9; // High confidence for category match
      } else {
        // Check for incompatible categories that should never match
        const incompatibleCategories = this.areIncompatibleCategories(category1.category, category2.category);
        if (incompatibleCategories) {
          console.log(`⚠️ CATEGORY SAFETY CHECK: ${category1.category} and ${category2.category} are incompatible`);
          console.log('Applying negative category boost: -50%');
          categoryBoost = -0.5; // Strong negative boost for incompatible categories
          
          // Add warning as a matched object with negative score
          matchedObjects.push({
            objectName: `WARNING: Incompatible categories (${category1.category} vs ${category2.category})`,
            similarityScore: 0 // Zero score for incompatible category
          });
        }
      }
      
      // Apply color matching boost
      let colorBoost = 0;
      if (colorComparison.score > 60) {
        colorBoost = 0.1; // 10% boost for similar colors
        console.log(`Adding color similarity boost: +10%`);
        
        // Add color as a matched object if highly similar
        matchedObjects.push({
          objectName: `Color similarity: ${colorComparison.score.toFixed(1)}%`,
          similarityScore: 80
        });
        
        totalScore += 0.8;
      }

      // Calculate final score and determine if it's a match
      let finalScore = matchedObjects.length > 0 
        ? (totalScore / matchedObjects.length) * 100 
        : 0;
      
      // Apply boosts to final score
      finalScore = finalScore * (1 + categoryBoost + colorBoost);
      
      // Cap at 100%
      finalScore = Math.min(finalScore, 100);
      
      console.log('\nFinal comparison results:');
      console.log(`- Number of matched objects: ${matchedObjects.length}`);
      console.log(`- Base score: ${(totalScore / matchedObjects.length * 100).toFixed(2)}%`);
      console.log(`- Category boost: ${(categoryBoost * 100).toFixed(2)}%`);
      console.log(`- Color boost: ${(colorBoost * 100).toFixed(2)}%`);
      console.log(`- Final score: ${finalScore.toFixed(2)}%`);
      console.log(`- Is match: ${finalScore > 60}`);
      console.log('=== Comparison complete ===\n');
      
      return {
        isMatch: finalScore > 60,
        score: finalScore,
        matchedObjects
      };
    } catch (error: unknown) {
      console.error('\nError comparing images:', error instanceof Error ? error.message : 'Unknown error');
      if (axios.isAxiosError(error) && error.response) {
        console.error('API error details:', {
          status: error.response.status,
          data: error.response.data
        });
      }
      return {
        isMatch: false,
        score: 0,
        matchedObjects: []
      };
    }
  }

  /**
   * Calculate similarity between two text strings
   * @param text1 First text string
   * @param text2 Second text string
   * @returns Similarity score between 0 and 1
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;
    
    // Convert to lowercase and remove special characters
    const normalized1 = text1.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const normalized2 = text2.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    if (normalized1 === normalized2) return 1;
    
    // Split into words
    const words1 = normalized1.split(/\s+/).filter(word => word.length > 2);
    const words2 = normalized2.split(/\s+/).filter(word => word.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    // Count common words
    const commonWords = words1.filter(word => words2.includes(word));
    
    // Calculate Jaccard similarity (intersection over union)
    const uniqueWords = new Set([...words1, ...words2]);
    return commonWords.length / uniqueWords.size;
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
      console.log('No image URL provided for new item');
      return [];
    }

    const matches = [];
    console.log(`Finding matches for item ${newItem._id} among ${existingItems.length} existing items`);

    for (const existingItem of existingItems) {
      if (!existingItem.imageUrl || existingItem._id === newItem._id) {
        continue;
      }

      try {
        // Calculate text similarity between descriptions
        let textSimilarityScore = 0;
        if (newItem.description && existingItem.description) {
          textSimilarityScore = this.calculateTextSimilarity(
            newItem.description,
            existingItem.description
          );
          console.log(`Text similarity between descriptions: ${(textSimilarityScore * 100).toFixed(2)}%`);
        }

        // Compare images
        const comparisonResult = await this.compareImages(
          newItem.imageUrl,
          existingItem.imageUrl
        );
        
        // Adjust final score by incorporating text similarity (10% weight)
        const textBoost = textSimilarityScore * 10; // Up to 10% boost
        const adjustedScore = comparisonResult.score * 0.9 + textBoost;
        
        console.log(`Item comparison summary for ${existingItem._id}:`);
        console.log(`- Visual match score: ${comparisonResult.score.toFixed(2)}%`);
        console.log(`- Text similarity boost: ${textBoost.toFixed(2)}%`);
        console.log(`- Final adjusted score: ${adjustedScore.toFixed(2)}%`);

        if (adjustedScore > 50) {
          console.log(`Found potential match: Item ${existingItem._id} with score ${adjustedScore.toFixed(2)}%`);
          matches.push({
            item: existingItem,
            score: adjustedScore
          });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error comparing with item ${existingItem._id}:`, errorMessage);
        if (axios.isAxiosError(error) && error.response) {
          console.error('API error details:', {
            status: error.response.status,
            data: error.response.data
          });
        }
      }
    }

    // Sort matches by score in descending order
    const sortedMatches = matches.sort((a, b) => b.score - a.score);
    console.log(`Found ${sortedMatches.length} potential matches`);
    return sortedMatches;
  }

  /**
   * Helper method to check if the analysis data contains electronics-related terms
   * @param data The image analysis data
   * @returns Array of identified electronics terms
   */
  private identifyElectronicsTerms(data: ImageData): string[] {
    const electronicsTerms = [
      'speaker', 'audio', 'sound', 'bluetooth', 'wireless', 'electronics', 
      'device', 'gadget', 'headphone', 'earphone', 'stereo', 'amplifier',
      'electronic device', 'technology', 'portable speaker', 'audio equipment',
      'loudspeaker', 'boombox', 'subwoofer', 'woofer', 'tweeter', 'soundbar', 
      'speaker system', 'audio system', 'sound system', 'home audio'
    ];
    
    // Print all raw terms we're searching through to help with debugging
    console.log('Original terms for electronics detection:');
    console.log('- Labels:', data.labels);
    console.log('- Web entities:', data.webEntities);
    console.log('- Best guesses:', data.bestGuessLabels);
    console.log('- Objects:', data.objects.map(obj => obj.name));
    
    // Create a map to track where each match was found
    const matchSources = new Map<string, string[]>();
    
    // Check for direct matches in each category
    electronicsTerms.forEach(term => {
      const sources: string[] = [];
      
      // Check labels
      if (data.labels.some(label => label.toLowerCase().includes(term))) {
        sources.push('labels');
      }
      
      // Check web entities
      if (data.webEntities.some(entity => entity.toLowerCase().includes(term))) {
        sources.push('webEntities');
      }
      
      // Check best guesses
      if (data.bestGuessLabels.some(label => label.toLowerCase().includes(term))) {
        sources.push('bestGuesses');
      }
      
      // Check objects
      if (data.objects.some(obj => obj.name.toLowerCase().includes(term))) {
        sources.push('objects');
      }
      
      if (sources.length > 0) {
        matchSources.set(term, sources);
      }
    });
    
    // Convert map to array of matches
    const matches = Array.from(matchSources.keys());
    
    if (matches.length > 0) {
      console.log('Electronics-related terms identified:');
      matches.forEach(match => {
        console.log(`- "${match}" found in: ${matchSources.get(match)?.join(', ')}`);
      });
    }
    
    return matches;
  }

  /**
   * Calculates color similarity between two RGB colors
   * @param color1 First RGB color
   * @param color2 Second RGB color
   * @returns Similarity score between 0 and 1
   */
  private calculateColorSimilarity(
    color1: { red: number; green: number; blue: number },
    color2: { red: number; green: number; blue: number }
  ): number {
    // Calculate Euclidean distance in RGB space
    const distance = Math.sqrt(
      Math.pow(color1.red - color2.red, 2) +
      Math.pow(color1.green - color2.green, 2) +
      Math.pow(color1.blue - color2.blue, 2)
    );
    
    // Convert distance to similarity score (0-1)
    // Max distance in RGB space is √(255²+255²+255²) = 441.67
    const maxDistance = 441.67;
    return 1 - (distance / maxDistance);
  }
  
  /**
   * Compares dominant colors between two images
   * @param colors1 Dominant colors from first image
   * @param colors2 Dominant colors from second image
   * @returns Object with similarity score and matching color pairs
   */
  private compareDominantColors(
    colors1: Array<{
      color: { red: number; green: number; blue: number };
      score: number;
      pixelFraction: number;
    }>,
    colors2: Array<{
      color: { red: number; green: number; blue: number };
      score: number;
      pixelFraction: number;
    }>
  ): { score: number; matches: Array<{ color1: string; color2: string; similarity: number }> } {
    if (colors1.length === 0 || colors2.length === 0) {
      return { score: 0, matches: [] };
    }
    
    const matches: Array<{ color1: string; color2: string; similarity: number }> = [];
    let totalSimilarity = 0;
    
    // Compare each color from colors1 with each color from colors2
    for (const colorData1 of colors1) {
      for (const colorData2 of colors2) {
        const similarity = this.calculateColorSimilarity(colorData1.color, colorData2.color);
        
        // Only consider pairs with high similarity
        if (similarity > 0.7) {
          const color1Hex = this.rgbToHex(colorData1.color);
          const color2Hex = this.rgbToHex(colorData2.color);
          
          matches.push({
            color1: color1Hex,
            color2: color2Hex,
            similarity: similarity * 100
          });
          
          // Weight by color importance (score * pixelFraction)
          const weight1 = colorData1.score * colorData1.pixelFraction;
          const weight2 = colorData2.score * colorData2.pixelFraction;
          const avgWeight = (weight1 + weight2) / 2;
          
          totalSimilarity += similarity * avgWeight;
        }
      }
    }
    
    // Normalize the score based on number of colors compared
    const normalizedScore = matches.length > 0 
      ? totalSimilarity / Math.min(colors1.length, colors2.length)
      : 0;
    
    return {
      score: normalizedScore * 100, // Convert to percentage
      matches
    };
  }
  
  /**
   * Converts RGB color to HEX string
   */
  private rgbToHex(color: { red: number; green: number; blue: number }): string {
    const r = Math.round(color.red);
    const g = Math.round(color.green);
    const b = Math.round(color.blue);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Categorizes the product based on detection data
   * @param data Image analysis data
   * @returns Product category information
   */
  private categorizeProduct(data: ImageData): { 
    category: string; 
    subcategory?: string; 
    confidence: number;
    terms: string[]; 
  } {
    // Define common product categories and their related terms
    const categoryDefinitions = {
      electronics: {
        terms: [
          'speaker', 'audio', 'sound', 'bluetooth', 'wireless', 'electronics', 
          'device', 'gadget', 'headphone', 'earphone', 'stereo', 'amplifier',
          'electronic device', 'technology', 'portable speaker', 'audio equipment',
          'loudspeaker', 'boombox', 'subwoofer', 'woofer', 'tweeter', 'soundbar',
          'phone', 'smartphone', 'cell phone', 'mobile phone', 'iphone', 'android',
          'laptop', 'computer', 'tablet', 'ipad', 'notebook', 'camera', 'digital camera',
          'video camera', 'webcam', 'charger', 'cable', 'usb', 'adapter', 'power bank',
          'earbuds', 'headset', 'watch', 'smartwatch', 'wearable', 'fitness tracker'
        ],
        subcategories: {
          'audio': ['speaker', 'headphone', 'earphone', 'earbuds', 'loudspeaker', 'soundbar', 'audio'],
          'mobile': ['phone', 'smartphone', 'cell phone', 'mobile phone', 'iphone', 'android'],
          'computing': ['laptop', 'computer', 'tablet', 'ipad', 'notebook'],
          'accessories': ['charger', 'cable', 'usb', 'adapter', 'power bank'],
          'wearable': ['watch', 'smartwatch', 'wearable', 'fitness tracker']
        }
      },
      clothing: {
        terms: [
          'clothing', 'apparel', 'jacket', 'coat', 'shirt', 'tshirt', 't-shirt', 
          'sweater', 'hoodie', 'pants', 'jeans', 'trousers', 'shorts', 'skirt', 
          'dress', 'sock', 'socks', 'glove', 'gloves', 'hat', 'cap', 'beanie', 
          'scarf', 'shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots', 
          'sandal', 'sandals', 'high heel', 'sweatshirt', 'underwear', 'belt'
        ],
        subcategories: {
          'outerwear': ['jacket', 'coat', 'sweater', 'hoodie'],
          'tops': ['shirt', 'tshirt', 't-shirt', 'sweatshirt'],
          'bottoms': ['pants', 'jeans', 'trousers', 'shorts', 'skirt'],
          'footwear': ['shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots', 'sandal', 'sandals']
        }
      },
      accessories: {
        terms: [
          'bag', 'handbag', 'purse', 'wallet', 'backpack', 'luggage', 'suitcase', 
          'umbrella', 'jewelry', 'necklace', 'bracelet', 'ring', 'earring', 
          'watch', 'sunglasses', 'glasses', 'eyeglasses', 'keychain', 'key', 'keys'
        ],
        subcategories: {
          'bags': ['bag', 'handbag', 'purse', 'backpack', 'luggage', 'suitcase'],
          'jewelry': ['jewelry', 'necklace', 'bracelet', 'ring', 'earring'],
          'eyewear': ['sunglasses', 'glasses', 'eyeglasses']
        }
      },
      documents: {
        terms: [
          'document', 'paper', 'card', 'id', 'identification', 'passport', 
          'license', 'certificate', 'book', 'notebook', 'diary', 'folder', 
          'file', 'letter', 'envelope', 'ticket', 'receipt', 'card', 'credit card',
          'debit card', 'business card', 'id card'
        ]
      }
    };
    
    const allTerms = [
      ...data.labels, 
      ...data.webEntities, 
      ...data.bestGuessLabels,
      ...data.objects.map(obj => obj.name)
    ].map(term => term.toLowerCase());
    
    // Find matches for each category
    const categoryMatches: Record<string, string[]> = {};
    let bestCategory = 'unknown';
    let bestSubcategory: string | undefined = undefined;
    let highestMatchCount = 0;
    
    // Find category with most matches
    for (const [category, categoryData] of Object.entries(categoryDefinitions)) {
      const terms = categoryData.terms;
      const matches = terms.filter(term => 
        allTerms.some(detected => detected.includes(term))
      );
      
      categoryMatches[category] = matches;
      
      if (matches.length > highestMatchCount) {
        highestMatchCount = matches.length;
        bestCategory = category;
      }
    }
    
    // If we found a category, check for subcategory
    if (bestCategory !== 'unknown' && highestMatchCount > 0) {
      const categoryData = categoryDefinitions[bestCategory as keyof typeof categoryDefinitions];
      
      // If this category has subcategories, determine the best one
      if ('subcategories' in categoryData) {
        const subcategories = categoryData.subcategories as Record<string, string[]>;
        let bestSubcategoryMatchCount = 0;
        
        for (const [subcategory, terms] of Object.entries(subcategories)) {
          const subcategoryMatches = terms.filter(term => 
            allTerms.some(detected => detected.includes(term))
          );
          
          if (subcategoryMatches.length > bestSubcategoryMatchCount) {
            bestSubcategoryMatchCount = subcategoryMatches.length;
            bestSubcategory = subcategory;
          }
        }
      }
    }
    
    // Calculate confidence based on number of matches and their prominence in the data
    let confidence = Math.min(highestMatchCount * 10, 95); // Cap at 95%
    
    // If we found label matches with high scores, boost confidence
    const categoryTerms = bestCategory !== 'unknown' 
      ? categoryDefinitions[bestCategory as keyof typeof categoryDefinitions].terms
      : [];
    
    // Boost confidence if terms appear in high-confidence labels
    data.labels.forEach(label => {
      if (categoryTerms.some(term => label.toLowerCase().includes(term))) {
        confidence = Math.min(confidence + 5, 95);
      }
    });
    
    // Log the categorization results
    console.log(`\nProduct categorization results:`);
    console.log(`- Category: ${bestCategory}${bestSubcategory ? ` (${bestSubcategory})` : ''}`);
    console.log(`- Confidence: ${confidence.toFixed(2)}%`);
    console.log(`- Matching terms: ${categoryMatches[bestCategory]?.join(', ') || 'none'}`);
    
    return {
      category: bestCategory,
      subcategory: bestSubcategory,
      confidence: confidence,
      terms: categoryMatches[bestCategory] || []
    };
  }

  /**
   * Post-processes analysis results to correct common misidentifications
   * @param analysisResult The analysis result to post-process
   */
  private postProcessAnalysisResult(analysisResult: ImageData): void {
    // Check for speaker-related evidence in labels and web entities
    const speakerEvidence = [
      ...analysisResult.labels,
      ...analysisResult.webEntities,
      ...analysisResult.bestGuessLabels
    ].filter(term => {
      const lowerTerm = term.toLowerCase();
      return lowerTerm.includes('speaker') || 
             lowerTerm.includes('audio') || 
             lowerTerm.includes('loudspeaker') ||
             lowerTerm.includes('sound') ||
             lowerTerm.includes('stereo');
    });
    
    // Log all detected terms for debugging
    console.log('\n=== Post-processing detection results ===');
    console.log('Objects:', analysisResult.objects.map(obj => obj.name));
    console.log('Labels:', analysisResult.labels);
    console.log('Web entities:', analysisResult.webEntities);
    console.log('Best guesses:', analysisResult.bestGuessLabels);
    console.log('Speaker-related evidence:', speakerEvidence);
    
    // Check for wallet misidentification
    const hasWalletObjects = analysisResult.objects.some(obj => 
      obj.name.toLowerCase() === 'wallet' || obj.name.toLowerCase() === 'purse'
    );
    
    // Check if we have strong audio evidence but wallet objects
    if (hasWalletObjects && speakerEvidence.length >= 2) {
      console.log('\n🔄 CORRECTING MISIDENTIFICATION: Wallet -> Speaker');
      console.log('Found wallet object but strong speaker evidence in labels/entities');
      
      // Replace wallet objects with speaker objects
      analysisResult.objects = analysisResult.objects.map(obj => {
        if (obj.name.toLowerCase() === 'wallet' || obj.name.toLowerCase() === 'purse') {
          console.log(`Replacing "${obj.name}" with "Loudspeaker" (original confidence: ${obj.score})`);
          return {
            ...obj,
            name: 'Loudspeaker'
          };
        }
        return obj;
      });
      
      // Make sure we have a speaker in the objects list
      if (!analysisResult.objects.some(obj => obj.name.toLowerCase().includes('speaker'))) {
        console.log('Adding explicit Loudspeaker object to detection results');
        analysisResult.objects.push({
          name: 'Loudspeaker',
          score: 0.9, // High confidence based on label evidence
          boundingBox: {
            x: 0.1,
            y: 0.1,
            width: 0.8,
            height: 0.8
          }
        });
      }
      
      // Add speaker to labels if not already present
      if (!analysisResult.labels.some(label => label.toLowerCase().includes('speaker'))) {
        analysisResult.labels.push('Loudspeaker');
      }
    }
    
    // Check for headphone misidentification (often confused with other objects)
    const headphoneEvidence = [
      ...analysisResult.labels,
      ...analysisResult.webEntities,
      ...analysisResult.bestGuessLabels
    ].filter(term => {
      const lowerTerm = term.toLowerCase();
      return lowerTerm.includes('headphone') || 
             lowerTerm.includes('earphone') || 
             lowerTerm.includes('earbuds') ||
             lowerTerm.includes('headset');
    });
    
    if (headphoneEvidence.length >= 2 && 
        !analysisResult.objects.some(obj => obj.name.toLowerCase().includes('headphone'))) {
      console.log('\n🔄 ADDING MISSING OBJECT: Headphone');
      console.log('Found headphone evidence in labels/entities but no headphone object');
      
      // Add headphone to objects
      analysisResult.objects.push({
        name: 'Headphone',
        score: 0.85,
        boundingBox: {
          x: 0.1,
          y: 0.1,
          width: 0.8,
          height: 0.8
        }
      });
    }
    
    // Handle "camera" detection
    const cameraEvidence = [
      ...analysisResult.labels,
      ...analysisResult.webEntities,
      ...analysisResult.bestGuessLabels
    ].filter(term => {
      const lowerTerm = term.toLowerCase();
      return lowerTerm.includes('camera') || 
             lowerTerm.includes('digital camera') || 
             lowerTerm.includes('dslr') ||
             lowerTerm.includes('photography');
    });
    
    if (cameraEvidence.length >= 2 && 
        !analysisResult.objects.some(obj => obj.name.toLowerCase().includes('camera'))) {
      console.log('\n🔄 ADDING MISSING OBJECT: Camera');
      console.log('Found camera evidence in labels/entities but no camera object');
      
      // Add camera to objects
      analysisResult.objects.push({
        name: 'Camera',
        score: 0.85,
        boundingBox: {
          x: 0.1,
          y: 0.1,
          width: 0.8,
          height: 0.8
        }
      });
    }
    
    // Force high confidence for any speaker detections
    analysisResult.objects = analysisResult.objects.map(obj => {
      if (obj.name.toLowerCase().includes('speaker') || 
          obj.name.toLowerCase().includes('loudspeaker')) {
        console.log(`Boosting confidence for ${obj.name} from ${obj.score} to 0.95`);
        return {
          ...obj,
          score: Math.max(obj.score, 0.95) // Ensure high confidence for speakers
        };
      }
      return obj;
    });
    
    console.log('Post-processed objects:', analysisResult.objects.map(obj => obj.name));
    console.log('=== Post-processing complete ===\n');
  }

  /**
   * Helper method to check if two categories are incompatible
   * @param category1 First category
   * @param category2 Second category
   * @returns True if categories are incompatible, false otherwise
   */
  private areIncompatibleCategories(category1: string, category2: string): boolean {
    // If one is unknown or they're the same, they're not incompatible
    if (category1 === 'unknown' || category2 === 'unknown' || category1 === category2) {
      return false;
    }
    
    // Define subcategory conflicts for stricter incompatibility checking
    const subcategoryConflicts = {
      // Map subcategories that should not match
      'audio': ['wallet', 'purse', 'bag', 'document', 'clothing'],
      'mobile': ['wallet', 'purse', 'bag', 'document'],
      'computing': ['wallet', 'purse', 'bag', 'clothing'],
      'wallet': ['audio', 'mobile', 'computing'],
      'bag': ['audio', 'mobile', 'computing']
    };
    
    // Check if we have subcategory conflict evidence from the objects
    const objects1 = this.getAssociatedObjectTypes(category1);
    const objects2 = this.getAssociatedObjectTypes(category2);
    
    // Look for specific object type conflicts
    for (const obj1 of objects1) {
      for (const obj2 of objects2) {
        const lowerObj1 = obj1.toLowerCase();
        const lowerObj2 = obj2.toLowerCase();
        
        // Check for specific wallet vs speaker conflict
        if ((lowerObj1.includes('wallet') && lowerObj2.includes('speaker')) ||
            (lowerObj2.includes('wallet') && lowerObj1.includes('speaker'))) {
          console.log(`⚠️ Specific object type conflict: ${obj1} vs ${obj2}`);
          return true;
        }
        
        // Check conflicts based on subcategory mapping
        for (const [subcat, conflicts] of Object.entries(subcategoryConflicts)) {
          if (lowerObj1.includes(subcat) && conflicts.some(c => lowerObj2.includes(c))) {
            console.log(`⚠️ Subcategory conflict: ${subcat} vs ${lowerObj2}`);
            return true;
          }
          
          if (lowerObj2.includes(subcat) && conflicts.some(c => lowerObj1.includes(c))) {
            console.log(`⚠️ Subcategory conflict: ${subcat} vs ${lowerObj1}`);
            return true;
          }
        }
      }
    }
    
    // For now, we'll be more permissive with general categories
    // and rely on specific object detection instead
    return false;
  }
  
  /**
   * Helper to get object types associated with a category
   * @param category The category
   * @returns Array of associated object types
   */
  private getAssociatedObjectTypes(category: string): string[] {
    switch (category) {
      case 'electronics':
        return ['speaker', 'loudspeaker', 'headphone', 'earphone', 'phone', 
                'smartphone', 'laptop', 'computer', 'camera', 'device'];
      case 'accessories':
        return ['wallet', 'purse', 'bag', 'backpack', 'handbag', 'sunglasses', 'watch'];
      case 'clothing':
        return ['shirt', 'jacket', 'pants', 'shoe', 'dress', 'hat', 'clothing'];
      case 'documents':
        return ['document', 'paper', 'book', 'notebook', 'id', 'card'];
      default:
        return [];
    }
  }
}

export default new ImageComparisonService(); 