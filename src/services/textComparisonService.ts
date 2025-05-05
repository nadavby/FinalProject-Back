/* eslint-disable @typescript-eslint/no-explicit-any */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { IItem } from '../models/item_model';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const compareItemsWithGemini = async (
  lostItem: IItem,
  foundItem: IItem,
  imageComparisonScore: number
): Promise<number> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const prompt = constructComparisonPrompt(lostItem, foundItem, imageComparisonScore);
    const result = await model.generateContent(prompt);
    const textResponse = result.response.text();
    return extractMatchScore(textResponse);
  } catch (error) {
    console.error('Error comparing items with Gemini:', error);
    return 0;
  }
};

const constructComparisonPrompt = (
  lostItem: IItem,
  foundItem: IItem,
  imageComparisonScore: number
): string => {
  return `
You are an AI assistant specializing in determining if a found item matches a lost item.
Analyze these two items and return a match score from 0-100 based on their similarity.

Lost Item:
- Type: ${lostItem.itemType}
- Category: ${lostItem.category || 'Not specified'}
- Description: ${lostItem.description || 'Not specified'}
- Location: ${formatLocation(lostItem.location)}
- Time: ${lostItem.timestamp ? new Date(lostItem.timestamp).toISOString() : 'Not specified'}
- Owner: ${lostItem.ownerName || 'Not specified'}

Found Item:
- Type: ${foundItem.itemType}
- Category: ${foundItem.category || 'Not specified'}
- Description: ${foundItem.description || 'Not specified'}
- Location: ${formatLocation(foundItem.location)}
- Time: ${foundItem.timestamp ? new Date(foundItem.timestamp).toISOString() : 'Not specified'}
- Owner: ${foundItem.ownerName || 'Not specified'}

Image Comparison Score: ${imageComparisonScore}/100

Rules for determining match score:
1. Category and item type must be compatible
2. Descriptions should have meaningful overlap in key details
3. Locations should be reasonably close
4. The found item date must be on or after the lost item date
5. Consider the image comparison score heavily
6. If descriptions are very detailed and match well, this should strongly influence the score

Give high weight to distinctive identifying features mentioned in both descriptions.
Provide your analysis as a JSON object ONLY in this exact format:
{"reasoning": "Your step-by-step reasoning", "score": number}

Do not include any additional text in your response, just the JSON.`;
};

const extractMatchScore = (response: string): number => {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return 0;
    
    const parsedResponse = JSON.parse(jsonMatch[0]);
    return typeof parsedResponse.score === 'number' ? Math.round(parsedResponse.score) : 0;
  } catch (error) {
    console.error('Error extracting match score:', error);
    return 0;
  }
};

const formatLocation = (location: any): string => {
  if (!location) return 'Not specified';
  
  try {
    if (typeof location === 'string') return location;
    
    if (location.lat !== undefined && location.lng !== undefined) {
      return `Latitude: ${location.lat}, Longitude: ${location.lng}`;
    }
    
    return JSON.stringify(location);
  } catch {
    return 'Invalid location format';
  }
}; 