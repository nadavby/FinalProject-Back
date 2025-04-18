import axios from 'axios';
import { IItem } from '../models/item_model';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cv: any;
try {
  console.log('OpenCV import attempted');
} catch (error) {
  console.warn('OpenCV not available:', error);
}

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
    this.apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY || '';
    if (!this.apiKey) {
      console.error('GOOGLE_CLOUD_VISION_API_KEY is not set in environment variables');
    }

    this.cvInitialized = false;
    this.analysisCache = {};
    this.cacheExpirationMs = 1000 * 60 * 60 * 24; 
    this.initializeOpenCV();

    if (this.apiKey && !/^AIza[0-9A-Za-z-_]{35}$/.test(this.apiKey)) {
      console.error('GOOGLE_CLOUD_VISION_API_KEY appears to be in an invalid format');
    }
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

  
  private normalizeUrl(url: string): string {
    try {
      let normalizedUrl = url.replace(/\\/g, '/');
      
     
      const decodedUrl = decodeURI(normalizedUrl);
      normalizedUrl = encodeURI(decodedUrl);
      
      console.log(`Normalized URL from ${url} to ${normalizedUrl}`);
      return normalizedUrl;
    } catch (error) {
      console.error('Error normalizing URL:', error);
      return url;
    }
  }

  
  public async analyzeImage(imageUrl: string): Promise<ImageData> {
    const normalizedUrl = this.normalizeUrl(imageUrl);
    console.log('\n=== Vision API Request Details ===');
    console.log('Original URL:', imageUrl);
    console.log('Normalized URL:', normalizedUrl);
    
    const cachedResult = this.analysisCache[normalizedUrl];
    const now = Date.now();
    
    if (cachedResult && (now - cachedResult.timestamp) < this.cacheExpirationMs) {
      console.log('Using cached analysis for:', normalizedUrl);
      return cachedResult.data;
    }

    if (!this.apiKey) {
      console.error('Cannot analyze image: API key is not configured');
      return this.getEmptyImageData();
    }

    try {
      let imagePath = '';
      if (normalizedUrl.startsWith('http://localhost')) {
        const publicIndex = normalizedUrl.indexOf('/public/');
        if (publicIndex !== -1) {
          imagePath = path.join(
            process.cwd(),
            'public',
            decodeURIComponent(normalizedUrl.slice(publicIndex + '/public/'.length))
          );
        }
      }

      let imageBuffer: Buffer;
      try {
        console.log('Attempting to read image from path:', imagePath);
        imageBuffer = fs.readFileSync(imagePath);
      } catch (error) {
        console.error('Error reading image file:', error);
        throw new Error(`Failed to read image file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      const encodedImage = imageBuffer.toString('base64');

      const visionRequest = {
        requests: [{
          image: {
            content: encodedImage
          },
          features: [
            { type: 'LABEL_DETECTION', maxResults: 10 },
            { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
            { type: 'WEB_DETECTION', maxResults: 10 },
            { type: 'IMAGE_PROPERTIES' },
            { type: 'SAFE_SEARCH_DETECTION' }
          ]
        }]
      };

      console.log('Sending request to Vision API...');
      console.log('Request headers:', {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Goog-Api-Key': '***API_KEY_HIDDEN***',
        'Referer': process.env.DOMAIN_BASE || 'http://localhost:3000',
        'Origin': process.env.DOMAIN_BASE || 'http://localhost:3000'
      });

      const response = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        visionRequest,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'Referer': process.env.DOMAIN_BASE || 'http://localhost:3000',
            'Origin': process.env.DOMAIN_BASE || 'http://localhost:3000',
            'User-Agent': 'LostAndFound-App/1.0'
          },
          timeout: 10000 
        }
      );

      if (!response.data || !response.data.responses) {
        throw new Error('Invalid response from Vision API');
      }

      const apiResponse: VisionApiResponse = response.data;
      if (!apiResponse.responses || apiResponse.responses.length === 0) {
        throw new Error('No response from Vision API');
      }

      console.log('Vision API Response Status:', response.status);
      console.log('Vision API Response Headers:', response.headers);

      const result = apiResponse.responses[0];
      const analysisResult: ImageData = {
        labels: (result.labelAnnotations || []).map(label => label.description),
        objects: (result.localizedObjectAnnotations || []).map(obj => ({
          name: obj.name,
          score: obj.score,
          boundingBox: {
            x: obj.boundingPoly.normalizedVertices[0]?.x || 0,
            y: obj.boundingPoly.normalizedVertices[0]?.y || 0,
            width: Math.abs((obj.boundingPoly.normalizedVertices[1]?.x || 0) - (obj.boundingPoly.normalizedVertices[0]?.x || 0)),
            height: Math.abs((obj.boundingPoly.normalizedVertices[2]?.y || 0) - (obj.boundingPoly.normalizedVertices[0]?.y || 0))
          }
        })),
        webEntities: (result.webDetection?.webEntities || []).map(entity => entity.description),
        bestGuessLabels: (result.webDetection?.bestGuessLabels || []).map(label => label.label),
        dominantColors: result.imagePropertiesAnnotation?.dominantColors?.colors || [],
        safeSearch: result.safeSearchAnnotation
      };

      this.analysisCache[normalizedUrl] = {
        timestamp: now,
        data: analysisResult
      };

      console.log('\nAnalysis results:', JSON.stringify(analysisResult, null, 2));
            
      return analysisResult;

    } catch (error) {
      this.handleVisionApiError(error);
      return this.getEmptyImageData();
    }
  }

  private handleVisionApiError(error: unknown): void {
    console.error('\n=== Vision API Error Details ===');
    console.error('Error analyzing image with Vision API:', error);
    
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      const headers = error.response?.headers;
      
      console.error('Response Status:', status);
      console.error('Response Headers:', headers);
      console.error('Response Data:', data);
      
      switch (status) {
        case 403:
          console.error('\nAuthentication failed. Please check:');
          console.error('1. API key is valid and enabled');
          console.error('2. Vision API is enabled in Google Cloud Console');
          console.error('3. Billing is enabled for the project');
          console.error('4. API restrictions are properly configured:');
          console.error('   - Check allowed referrers in Google Cloud Console');
          console.error('   - Current referrer:', process.env.DOMAIN_BASE || 'http://localhost:3000');
          console.error('   - Make sure the domain is added to allowed referrers');
          console.error('\nRequest Details:');
          console.error('URL:', error.config?.url);
          console.error('Headers:', {
            ...error.config?.headers,
            'X-Goog-Api-Key': '***API_KEY_HIDDEN***'
          });
          break;
        case 400:
          console.error('Bad request. The image may be invalid or too large');
          console.error('Request payload:', error.config?.data);
          break;
        case 429:
          console.error('Rate limit exceeded. Please try again later');
          break;
        default:
          console.error(`API request failed with status ${status}`);
          if (data) {
            console.error('Error details:', data);
          }
      }
      console.error('=== End Error Details ===\n');
    }
  }

  private getEmptyImageData(): ImageData {
    return {
      labels: [],
      objects: [],
      webEntities: [],
      bestGuessLabels: [],
      dominantColors: [],
      safeSearch: undefined
    };
  }

  
  public async compareImages(image1Url: string, image2Url: string): Promise<ComparisonResult> {
    try {
      console.log(`\n=== Starting image comparison ===`);
      console.log(`Comparing images:\n- Image 1: ${image1Url}\n- Image 2: ${image2Url}`);

      console.log('Analyzing both images...');
      const [image1Data, image2Data] = await Promise.all([
        this.analyzeImage(image1Url),
        this.analyzeImage(image2Url)
      ]);

      if (!image1Data || !image2Data) {
        console.log('One or both image analyses failed to return data');
        return {
          isMatch: false,
          score: 0,
          matchedObjects: []
        };
      }

      console.log('\nAnalysis results:');
      console.log('Image 1 analysis:', JSON.stringify(image1Data, null, 2));
      console.log('Image 2 analysis:', JSON.stringify(image2Data, null, 2));
      
      image1Data.labels = image1Data.labels || [];
      image1Data.objects = image1Data.objects || [];
      image1Data.webEntities = image1Data.webEntities || [];
      image1Data.bestGuessLabels = image1Data.bestGuessLabels || [];
      
      image2Data.labels = image2Data.labels || [];
      image2Data.objects = image2Data.objects || [];
      image2Data.webEntities = image2Data.webEntities || [];
      image2Data.bestGuessLabels = image2Data.bestGuessLabels || [];

      const isKey1 = this.isKeyImage(image1Data);
      const isKey2 = this.isKeyImage(image2Data);

      if (isKey1 && isKey2) {
        console.log('Both images are identified as keys - performing key-specific comparison');
        return this.compareKeys(image1Data, image2Data);
      }
      
      const category1 = this.categorizeProduct(image1Data);
      const category2 = this.categorizeProduct(image2Data);
      
      console.log('\nCategory comparison:');
      console.log(`- Image 1: ${category1.category}${category1.subcategory ? ` (${category1.subcategory})` : ''} (${category1.confidence.toFixed(2)}%)`);
      console.log(`- Image 2: ${category2.category}${category2.subcategory ? ` (${category2.subcategory})` : ''} (${category2.confidence.toFixed(2)}%)`);
      
      const isSameCategory = category1.category === category2.category && category1.category !== 'unknown';
      const isSameSubcategory = category1.subcategory === category2.subcategory && category1.subcategory !== undefined;
      
      if (isSameCategory) {
        console.log(`Same product category: ${category1.category}`);
        if (isSameSubcategory) {
          console.log(`Same product subcategory: ${category1.subcategory}`);
        }
      } else {
        console.log(`Different product categories: ${category1.category} vs ${category2.category}`);
      }
      
      const colorComparison = this.compareDominantColors(
        image1Data.dominantColors || [],
        image2Data.dominantColors || []
      );
      
      console.log('\nColor comparison:');
      console.log(`- Color similarity score: ${colorComparison.score.toFixed(2)}%`);
      console.log(`- Matching colors: ${colorComparison.matches.length}`);
      
      if (colorComparison.matches.length > 0) {
        console.log('- Color matches:');
        colorComparison.matches.forEach(match => {
          console.log(`  * ${match.color1} ↔ ${match.color2} (${match.similarity.toFixed(2)}%)`);
        });
      }
      
      const electronics1 = this.identifyElectronicsTerms(image1Data);
      const electronics2 = this.identifyElectronicsTerms(image2Data);
      
      const commonElectronics = electronics1.filter(term => 
        term && electronics2.includes(term)
      );
      
      if (commonElectronics.length > 0) {
        console.log('\nCommon electronics terms found:', commonElectronics);
      }

      const commonLabels = image1Data.labels.filter(label => 
        label && image2Data.labels.includes(label)
      );

      console.log('\nCommon labels found:', commonLabels.length);
      if (commonLabels.length > 0) {
        console.log('Labels:', commonLabels);
      }
      
      const commonWebEntities = image1Data.webEntities.filter(entity => 
        entity && image2Data.webEntities.includes(entity)
      );
      
      console.log('\nCommon web entities found:', commonWebEntities.length);
      if (commonWebEntities.length > 0) {
        console.log('Web Entities:', commonWebEntities);
      }
      
      const commonBestGuesses = image1Data.bestGuessLabels.filter(label => 
        label && image2Data.bestGuessLabels.includes(label)
      );
      
      console.log('\nCommon best guess labels:', commonBestGuesses.length);
      if (commonBestGuesses.length > 0) {
        console.log('Best Guesses:', commonBestGuesses);
      }

      if (commonLabels.length === 0 && commonWebEntities.length === 0 && commonBestGuesses.length === 0) {
        console.log('No common identifiers found - items are likely different');
        return {
          isMatch: false,
          score: 0,
          matchedObjects: []
        };
      }

      const matchedObjects: Array<{ objectName: string; similarityScore: number }> = [];
      let totalScore = 0;

      for (const label of commonLabels) {
        if (!label) continue; 
        
        console.log(`\nAdding label match: ${label}`);
        const isSpeakerLabel = label.toLowerCase().includes('speaker') || 
                              label.toLowerCase().includes('audio') ||
                              label.toLowerCase() === 'loudspeaker';
        
        const labelScore = isSpeakerLabel ? 0.95 : 0.8;
        
        matchedObjects.push({
          objectName: label,
          similarityScore: labelScore * 100
        });
        
        totalScore += labelScore;
        
        if (isSpeakerLabel) {
          console.log(`*** Found speaker-related label: ${label} with high confidence ***`);
        }
      }

      const hasImage1WalletObjects = image1Data.objects.some(obj => 
        obj.name && obj.name.toLowerCase() === 'wallet'
      );
      const hasImage2WalletObjects = image2Data.objects.some(obj => 
        obj.name && obj.name.toLowerCase() === 'wallet'
      );
      
      const hasImage1SpeakerLabel = image1Data.labels.some(label => 
        label && (label.toLowerCase() === 'loudspeaker' || label.toLowerCase() === 'speaker')
      );
      const hasImage2SpeakerLabel = image2Data.labels.some(label => 
        label && (label.toLowerCase() === 'loudspeaker' || label.toLowerCase() === 'speaker')
      );
      
      if ((hasImage1WalletObjects && hasImage1SpeakerLabel) || 
          (hasImage2WalletObjects && hasImage2SpeakerLabel)) {
        console.log('\n DETECTED WALLET-SPEAKER CONFLICT IN COMPARISON STAGE');
        console.log('This suggests the post-processing didn\'t catch all misidentifications');
        
        const correctedImage1Objects = [...image1Data.objects];
        const correctedImage2Objects = [...image2Data.objects];
        
        if (hasImage1WalletObjects && hasImage1SpeakerLabel) {
          console.log('Converting Wallet objects to Loudspeaker in Image 1 for comparison');
          for (let i = 0; i < correctedImage1Objects.length; i++) {
            if (correctedImage1Objects[i].name && correctedImage1Objects[i].name.toLowerCase() === 'wallet') {
              correctedImage1Objects[i] = {
                ...correctedImage1Objects[i],
                name: 'Loudspeaker',
                score: 0.95
              };
            }
          }
        }
        
        if (hasImage2WalletObjects && hasImage2SpeakerLabel) {
          console.log('Converting Wallet objects to Loudspeaker in Image 2 for comparison');
          for (let i = 0; i < correctedImage2Objects.length; i++) {
            if (correctedImage2Objects[i].name && correctedImage2Objects[i].name.toLowerCase() === 'wallet') {
              correctedImage2Objects[i] = {
                ...correctedImage2Objects[i],
                name: 'Loudspeaker',
                score: 0.95
              };
            }
          }
        }
        
        console.log('Using corrected objects for comparison:');
        console.log('Image 1 corrected objects:', correctedImage1Objects.map(obj => obj.name));
        console.log('Image 2 corrected objects:', correctedImage2Objects.map(obj => obj.name));
        
        for (const obj1 of correctedImage1Objects) {
          for (const obj2 of correctedImage2Objects) {
            if (obj1.name && obj2.name && obj1.name.toLowerCase() === obj2.name.toLowerCase()) {
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
      } else {
        for (const obj1 of image1Data.objects) {
          for (const obj2 of image2Data.objects) {
            if (obj1.name && obj2.name && obj1.name.toLowerCase() === obj2.name.toLowerCase()) {
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
      }
      
      if (matchedObjects.length === 0 && (commonWebEntities.length > 0 || commonBestGuesses.length > 0 || commonElectronics.length > 0)) {
        console.log('\nUsing web entities and best guesses for matching:');
        
        for (const entity of commonWebEntities) {
          console.log(`Adding web entity match: ${entity}`);
          matchedObjects.push({
            objectName: entity,
            similarityScore: 70
          });
          totalScore += 0.7;
        }
        
        for (const label of commonBestGuesses) {
          console.log(`Adding best guess match: ${label}`);
          matchedObjects.push({
            objectName: label,
            similarityScore: 75
          });
          totalScore += 0.75;
        }
        
        for (const term of commonElectronics) {
          console.log(`Adding electronics term match: ${term}`);
          matchedObjects.push({
            objectName: term,
            similarityScore: 85
          });
          totalScore += 0.85;
        }
      }

      let categoryBoost = 0;
      if (isSameCategory) {
        categoryBoost = 0.15;
        console.log(`Adding category match boost: +15%`);
        
        if (isSameSubcategory) {
          categoryBoost += 0.1; 
          console.log(`Adding subcategory match boost: +10%`);
        }
        
        
        matchedObjects.push({
          objectName: `Category: ${category1.category}${category1.subcategory ? ` (${category1.subcategory})` : ''}`,
          similarityScore: 90
        });
        
        totalScore += 0.9; 
      } else {
        
        const incompatibleCategories = this.areIncompatibleCategories(category1.category, category2.category);
        if (incompatibleCategories) {
          console.log(`⚠️ CATEGORY SAFETY CHECK: ${category1.category} and ${category2.category} are incompatible`);
          console.log('Applying negative category boost: -50%');
          categoryBoost = -0.5; 
          
          matchedObjects.push({
            objectName: `WARNING: Incompatible categories (${category1.category} vs ${category2.category})`,
            similarityScore: 0 
          });
        }
      }
      
      let colorBoost = 0;
      if (colorComparison.score > 60) {
        colorBoost = 0.1; 
        console.log(`Adding color similarity boost: +10%`);
        
        matchedObjects.push({
          objectName: `Color similarity: ${colorComparison.score.toFixed(1)}%`,
          similarityScore: 80
        });
        
        totalScore += 0.8;
      }

      let finalScore = matchedObjects.length > 0 
        ? (totalScore / matchedObjects.length) * 100 
        : 0;
      
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

 
  private isKeyImage(data: ImageData): boolean {
    const keyTerms = ['key', 'keys', 'car key', 'lock and key', 'car alarm'];
    
    const hasKeyLabel = data.labels.some(label => 
      keyTerms.some(term => label?.toLowerCase().includes(term.toLowerCase()))
    );

    const hasKeyEntity = data.webEntities.some(entity => 
      entity && keyTerms.some(term => entity.toLowerCase().includes(term.toLowerCase()))
    );

    const hasKeyBestGuess = data.bestGuessLabels.some(label => 
      label && keyTerms.some(term => label.toLowerCase().includes(term.toLowerCase()))
    );

    const isKey = hasKeyLabel || hasKeyEntity || hasKeyBestGuess;
    
    if (isKey) {
      console.log('Key detection evidence:');
      if (hasKeyLabel) console.log('- Found key in labels');
      if (hasKeyEntity) console.log('- Found key in web entities');
      if (hasKeyBestGuess) console.log('- Found key in best guess labels');
    }

    return isKey;
  }

  
  private compareKeys(image1Data: ImageData, image2Data: ImageData): ComparisonResult {
    console.log('\nPerforming key-specific comparison...');
    
    const matchedObjects: Array<{ objectName: string; similarityScore: number }> = [];
    let totalScore = 0;

    const keyLabels1 = image1Data.labels.filter(label => 
      label && ['key', 'car key', 'lock and key', 'car alarm'].some(term => 
        label.toLowerCase().includes(term.toLowerCase())
      )
    );
    
    const keyLabels2 = image2Data.labels.filter(label => 
      label && ['key', 'car key', 'lock and key', 'car alarm'].some(term => 
        label.toLowerCase().includes(term.toLowerCase())
      )
    );

    console.log('Key labels in image 1:', keyLabels1);
    console.log('Key labels in image 2:', keyLabels2);

    for (const label1 of keyLabels1) {
      for (const label2 of keyLabels2) {
        if (label1 && label2 && label1.toLowerCase() === label2.toLowerCase()) {
          console.log(`Matched key label: ${label1}`);
          matchedObjects.push({
            objectName: label1,
            similarityScore: 90
          });
          totalScore += 0.9;
        }
      }
    }

    const colorComparison = this.compareDominantColors(
      image1Data.dominantColors || [],
      image2Data.dominantColors || []
    );

    console.log('Color similarity score:', colorComparison.score.toFixed(2) + '%');

    if (colorComparison.score > 60) {
      totalScore += (colorComparison.score / 100) * 0.3; 
      matchedObjects.push({
        objectName: 'Similar metallic color profile',
        similarityScore: colorComparison.score
      });
    }

    const finalScore = Math.min((totalScore / (matchedObjects.length || 1)) * 100, 100);

    console.log('\nKey comparison results:');
    console.log(`- Number of matched attributes: ${matchedObjects.length}`);
    console.log(`- Color similarity: ${colorComparison.score.toFixed(2)}%`);
    console.log(`- Final score: ${finalScore.toFixed(2)}%`);

    return {
      isMatch: finalScore > 60,
      score: finalScore,
      matchedObjects
    };
  }

  
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;
    
    const normalized1 = text1.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const normalized2 = text2.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    if (normalized1 === normalized2) return 1;
    
    const words1 = normalized1.split(/\s+/).filter(word => word.length > 2);
    const words2 = normalized2.split(/\s+/).filter(word => word.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const commonWords = words1.filter(word => words2.includes(word));
    
    const uniqueWords = new Set([...words1, ...words2]);
    return commonWords.length / uniqueWords.size;
  }

  
  public async findMatchesForItem(
    newItem: IItem, 
    existingItems: IItem[]
  ): Promise<Array<{ item: IItem, score: number }>> {
    if (!newItem.imageUrl) {
      console.log('No image URL provided for new item');
      return [];
    }

    const matches = [];
    console.log(`\n=== Finding matches for item ${newItem._id} ===`);
    console.log(`Comparing against ${existingItems.length} existing items`);
    console.log(`New item image URL: ${newItem.imageUrl}`);
    console.log(`New item description: ${newItem.description || 'No description'}\n`);

    for (const existingItem of existingItems) {
      if (!existingItem.imageUrl || existingItem._id === newItem._id) {
        console.log(`Skipping item ${existingItem._id}: ${!existingItem.imageUrl ? 'No image URL' : 'Same as new item'}`);
        continue;
      }

      try {
        console.log(`\nComparing with item ${existingItem._id}:`);
        console.log(`Image URL: ${existingItem.imageUrl}`);
        console.log(`Description: ${existingItem.description || 'No description'}`);

        let textSimilarityScore = 0;
        if (newItem.description && existingItem.description) {
          const newDesc = String(newItem.description);
          const existingDesc = String(existingItem.description);
          
          if (newDesc.trim() && existingDesc.trim()) {
            textSimilarityScore = this.calculateTextSimilarity(newDesc, existingDesc);
            console.log(`Text similarity between descriptions: ${(textSimilarityScore * 100).toFixed(2)}%`);
          }
        }

        console.log('Starting image comparison...');
        const comparisonResult = await this.compareImages(
          newItem.imageUrl,
          existingItem.imageUrl
        );
        
        const textBoost = textSimilarityScore * 10; 
        const adjustedScore = comparisonResult.score * 0.9 + textBoost;
        
        console.log(`\nItem comparison summary for ${existingItem._id}:`);
        console.log(`- Visual match score: ${comparisonResult.score.toFixed(2)}%`);
        console.log(`- Text similarity boost: ${textBoost.toFixed(2)}%`);
        console.log(`- Final adjusted score: ${adjustedScore.toFixed(2)}%`);

        if (adjustedScore > 50) {
          console.log(` Found potential match: Item ${existingItem._id} with score ${adjustedScore.toFixed(2)}%`);
          matches.push({
            item: existingItem,
            score: adjustedScore
          });
        } else {
          console.log(` Score too low (${adjustedScore.toFixed(2)}%) - not considering as a match`);
        }
      } catch (error: unknown) {
        console.error(`\n Error comparing with item ${existingItem._id}:`);
        if (error instanceof Error) {
          console.error(`- Error message: ${error.message}`);
        } else {
          console.error('- Unknown error occurred');
        }
        
        if (axios.isAxiosError(error) && error.response) {
          console.error('- API error details:', {
            status: error.response.status,
            data: error.response.data
          });
        }
        continue;
      }
    }

    const sortedMatches = matches.sort((a, b) => b.score - a.score);
    
    console.log(`\n=== Match finding complete ===`);
    console.log(`Found ${sortedMatches.length} potential matches`);
    if (sortedMatches.length > 0) {
      console.log('Top matches:');
      sortedMatches.slice(0, 3).forEach((match, index) => {
        console.log(`${index + 1}. Item ${match.item._id} - Score: ${match.score.toFixed(2)}%`);
      });
    }
    console.log('===========================\n');
    
    return sortedMatches;
  }

  
  private identifyElectronicsTerms(data: ImageData): string[] {
    const electronicsTerms = [
      'speaker', 'audio', 'sound', 'bluetooth', 'wireless', 'electronics', 
      'device', 'gadget', 'headphone', 'earphone', 'stereo', 'amplifier',
      'electronic device', 'technology', 'portable speaker', 'audio equipment',
      'loudspeaker', 'boombox', 'subwoofer', 'woofer', 'tweeter', 'soundbar', 
      'speaker system', 'audio system', 'sound system', 'home audio', 'jbl'
    ];
    
    console.log('Original terms for electronics detection:');
    console.log('- Labels:', data.labels);
    console.log('- Web entities:', data.webEntities);
    console.log('- Best guesses:', data.bestGuessLabels);
    console.log('- Objects:', data.objects.map(obj => obj.name));
    
    let hasBlackColor = false;
    if (data.dominantColors && data.dominantColors.length > 0) {
      hasBlackColor = data.dominantColors.some(color => {
        const { red, green, blue } = color.color;
        return red < 50 && green < 50 && blue < 50 && color.pixelFraction > 0.2;
      });
      
      if (hasBlackColor) {
        console.log('Detected black dominant color - potential JBL speaker');
      }
    }
    
    const hasSpeakerLabel = data.labels.some(label => 
      label.toLowerCase().includes('speaker') || 
      label.toLowerCase().includes('loudspeaker')
    );
    
    if (hasBlackColor && hasSpeakerLabel) {
      console.log('Black speaker detected - adding JBL as a potential brand match');
      data.webEntities.push('JBL speaker');
    }
    
    const matchSources = new Map<string, string[]>();
    
    electronicsTerms.forEach(term => {
      const sources: string[] = [];
      
      if (data.labels.some(label => label.toLowerCase().includes(term))) {
        sources.push('labels');
      }
      
      if (data.webEntities.some(entity => entity.toLowerCase().includes(term))) {
        sources.push('webEntities');
      }
      
      if (data.bestGuessLabels.some(label => label.toLowerCase().includes(term))) {
        sources.push('bestGuesses');
      }
      
      if (data.objects.some(obj => obj.name.toLowerCase().includes(term))) {
        sources.push('objects');
      }
      
      if (sources.length > 0) {
        matchSources.set(term, sources);
      }
    });
    
    const matches = Array.from(matchSources.keys());
    
    if (matches.length > 0) {
      console.log('Electronics-related terms identified:');
      matches.forEach(match => {
        console.log(`- "${match}" found in: ${matchSources.get(match)?.join(', ')}`);
      });
    }
    
    return matches;
  }

  
  private calculateColorSimilarity(
    color1: { red: number; green: number; blue: number },
    color2: { red: number; green: number; blue: number }
  ): number {
    const distance = Math.sqrt(
      Math.pow(color1.red - color2.red, 2) +
      Math.pow(color1.green - color2.green, 2) +
      Math.pow(color1.blue - color2.blue, 2)
    );
    
    const maxDistance = 441.67;
    return 1 - (distance / maxDistance);
  }
  
  
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
    
    for (const colorData1 of colors1) {
      for (const colorData2 of colors2) {
        const similarity = this.calculateColorSimilarity(colorData1.color, colorData2.color);
        
        if (similarity > 0.7) {
          const color1Hex = this.rgbToHex(colorData1.color);
          const color2Hex = this.rgbToHex(colorData2.color);
          
          matches.push({
            color1: color1Hex,
            color2: color2Hex,
            similarity: similarity * 100
          });
          
          const weight1 = colorData1.score * colorData1.pixelFraction;
          const weight2 = colorData2.score * colorData2.pixelFraction;
          const avgWeight = (weight1 + weight2) / 2;
          
          totalSimilarity += similarity * avgWeight;
        }
      }
    }
    
    const normalizedScore = matches.length > 0 
      ? totalSimilarity / Math.min(colors1.length, colors2.length)
      : 0;
    
    return {
      score: normalizedScore * 100, 
      matches
    };
  }
  
  
  private rgbToHex(color: { red: number; green: number; blue: number }): string {
    const r = Math.round(color.red);
    const g = Math.round(color.green);
    const b = Math.round(color.blue);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

 
  private categorizeProduct(data: ImageData): { 
    category: string; 
    subcategory?: string; 
    confidence: number;
    terms: string[]; 
  } {
    const hasSpeakerLabels = data.labels.some(label => 
      label.toLowerCase().includes('speaker') || 
      label.toLowerCase().includes('loudspeaker')
    );
    
    let hasBlackColor = false;
    if (data.dominantColors && data.dominantColors.length > 0) {
      hasBlackColor = data.dominantColors.some(color => {
        const { red, green, blue } = color.color;
        return red < 50 && green < 50 && blue < 50 && color.pixelFraction > 0.2;
      });
    }
    
    if (hasSpeakerLabels && hasBlackColor) {
      console.log('⚠️ Special case: Detected black speaker (likely JBL or similar)');
      return {
        category: 'electronics',
        subcategory: 'audio',
        confidence: 95,
        terms: ['speaker', 'loudspeaker', 'audio', 'jbl']
      };
    }
    
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
    
    const categoryMatches: Record<string, string[]> = {};
    let bestCategory = 'unknown';
    let bestSubcategory: string | undefined = undefined;
    let highestMatchCount = 0;
    
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
    
    if (bestCategory !== 'unknown' && highestMatchCount > 0) {
      const categoryData = categoryDefinitions[bestCategory as keyof typeof categoryDefinitions];
      
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
    
    let confidence = Math.min(highestMatchCount * 10, 95); // Cap at 95%
    
    const categoryTerms = bestCategory !== 'unknown' 
      ? categoryDefinitions[bestCategory as keyof typeof categoryDefinitions].terms
      : [];
    
    data.labels.forEach(label => {
      if (categoryTerms.some(term => label.toLowerCase().includes(term))) {
        confidence = Math.min(confidence + 5, 95);
      }
    });
    
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
  
  private areIncompatibleCategories(category1: string, category2: string): boolean {
    if (category1 === 'unknown' || category2 === 'unknown' || category1 === category2) {
      return false;
    }
    
    const subcategoryConflicts = {
      'audio': ['wallet', 'purse', 'bag', 'document', 'clothing'],
      'mobile': ['wallet', 'purse', 'bag', 'document'],
      'computing': ['wallet', 'purse', 'bag', 'clothing'],
      'wallet': ['audio', 'mobile', 'computing'],
      'bag': ['audio', 'mobile', 'computing']
    };
    
    const objects1 = this.getAssociatedObjectTypes(category1);
    const objects2 = this.getAssociatedObjectTypes(category2);
    
    for (const obj1 of objects1) {
      for (const obj2 of objects2) {
        const lowerObj1 = obj1.toLowerCase();
        const lowerObj2 = obj2.toLowerCase();
        
        if ((lowerObj1.includes('wallet') && lowerObj2.includes('speaker')) ||
            (lowerObj2.includes('wallet') && lowerObj1.includes('speaker'))) {
          console.log(` Specific object type conflict: ${obj1} vs ${obj2}`);
          return true;
        }
        
        for (const [subcat, conflicts] of Object.entries(subcategoryConflicts)) {
          if (lowerObj1.includes(subcat) && conflicts.some(c => lowerObj2.includes(c))) {
            console.log(` Subcategory conflict: ${subcat} vs ${lowerObj2}`);
            return true;
          }
          
          if (lowerObj2.includes(subcat) && conflicts.some(c => lowerObj1.includes(c))) {
            console.log(` Subcategory conflict: ${subcat} vs ${lowerObj1}`);
            return true;
          }
        }
      }
    }
    
    return false;
  }
  
  
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