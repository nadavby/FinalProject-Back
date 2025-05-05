import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { IItem } from "../models/item_model";

type IItemWithTimestamps = IItem & {
  createdAt?: Date;
  updatedAt?: Date;
};

class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || "AIzaSyBuhqOtRNZq2954QjKMsI66vbbwCNIjsfU";
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }
  
  async compareDescriptions(lostItem: IItem, foundItem: IItem): Promise<{ isTextLikelyMatch: boolean, reason: string }> {
    try {
      const lostDescription = lostItem.description || '';
      const foundDescription = foundItem.description || '';
      
      if (!lostDescription || !foundDescription) {
        return { isTextLikelyMatch: false, reason: "One or both items missing description" };
      }

      const prompt = `
You are an expert AI assistant for a Lost & Found platform, specializing in semantic analysis.

We have two items, one lost and one found. Each has a detailed description and metadata.

Your task: Perform a comprehensive semantic analysis to determine if these items could be the same.

LOST ITEM DETAILS:
Description: "${lostDescription}"
Category: ${lostItem.category || 'N/A'}
Date Lost: ${(lostItem as IItemWithTimestamps).createdAt?.toLocaleString() || 'N/A'}
Location: ${JSON.stringify(lostItem.location) || 'N/A'}

FOUND ITEM DETAILS:
Description: "${foundDescription}"
Category: ${foundItem.category || 'N/A'}
Date Found: ${(foundItem as IItemWithTimestamps).createdAt?.toLocaleString() || 'N/A'}
Location: ${JSON.stringify(foundItem.location) || 'N/A'}

Consider the following aspects:
1. Category Match
   - Exact category matches are highly significant
   - Consider related categories (e.g., "Electronics" and "Phones")

2. Key Identifying Features
   - Color, size, brand, model
   - Distinctive marks or characteristics
   - Condition descriptions
   - Contents or accessories mentioned

3. Contextual Analysis
   - Time and location relationship
   - Plausible movement patterns
   - Common loss/find scenarios for this type of item

4. Language Variations
   - Synonyms and related terms
   - Brand/model variations
   - Common misspellings
   - Regional terminology differences

5. Temporal and Spatial Logic
   - Found date must be after lost date
   - Geographic feasibility
   - Typical item mobility patterns

IMPORTANT: You must respond ONLY with valid JSON in the exact format below. No markdown formatting, no backticks, no extra text:
{"isTextLikelyMatch": true/false, "reason": "your detailed reasoning here", "confidence": number}

Where:
- isTextLikelyMatch: true if descriptions likely refer to the same item
- reason: detailed explanation of your decision
- confidence: number between 0-100 indicating your confidence level

Set isTextLikelyMatch to true only if there's strong evidence these are the same item, considering ALL provided information.
`;

      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text().trim();
      
      try {
        let cleanedResponse = responseText;
        cleanedResponse = cleanedResponse.replace(/```json\s+|\s+```|```/g, '');
        cleanedResponse = cleanedResponse.replace(/`/g, '');
        
        const parsedResponse = JSON.parse(cleanedResponse);
        
        if (typeof parsedResponse.isTextLikelyMatch !== 'boolean' || typeof parsedResponse.reason !== 'string' || typeof parsedResponse.confidence !== 'number') {
          console.error("Invalid response structure from Gemini:", parsedResponse);
          return { isTextLikelyMatch: false, reason: "Error: Invalid response format from AI" };
        }
        
        return parsedResponse;
      } catch (error) {
        console.error("Error parsing Gemini response:", error);
        console.error("Raw response:", responseText);
        return { isTextLikelyMatch: false, reason: "Error processing text comparison" };
      }
    } catch (error) {
      console.error("Error in compareDescriptions:", error);
      return { isTextLikelyMatch: false, reason: "Error processing text comparison" };
    }
  }

  async evaluateMatch(
    lostItem: IItem, 
    foundItem: IItem,
    textComparisonResult: { isTextLikelyMatch: boolean, reason: string },
    visionSimilarityResult: { similarityScore: number }
  ): Promise<{ confidenceScore: number; reasoning: string }> {
    try {
      const prompt = `
You are an expert match evaluator for a Lost & Found platform, specializing in multi-factor item matching.

Your task is to perform a comprehensive analysis of how likely two items are the same, considering ALL available data.

ITEM DETAILS:

LOST ITEM:
Description: ${lostItem.description || 'N/A'}
Category: ${lostItem.category || 'N/A'}
Location: ${JSON.stringify(lostItem.location) || 'N/A'}
Date Lost: ${(lostItem as IItemWithTimestamps).createdAt?.toLocaleString() || 'N/A'}
Vision API Data: ${JSON.stringify(lostItem.visionApiData || {}, null, 2)}

FOUND ITEM:
Description: ${foundItem.description || 'N/A'}
Category: ${foundItem.category || 'N/A'}
Location: ${JSON.stringify(foundItem.location) || 'N/A'}
Date Found: ${(foundItem as IItemWithTimestamps).createdAt?.toLocaleString() || 'N/A'}
Vision API Data: ${JSON.stringify(foundItem.visionApiData || {}, null, 2)}

TEXT COMPARISON RESULT:
Match Likelihood: ${textComparisonResult.isTextLikelyMatch ? 'Likely Match' : 'Not Likely Match'}
Reasoning: ${textComparisonResult.reason}

Vision API Similarity Score: ${visionSimilarityResult.similarityScore}/100

SCORING COMPONENTS:

1. VISUAL SIMILARITY (45% of total score):
   Base Score: Vision API similarity score (weighted heavily)
   Additional Factors:
   - Label match significance (common vs. specific labels)
   - Object detection confidence
   - Color similarity (if available)
   - Object positioning similarity
   - Visual feature alignment
   Scoring Guidelines:
   - Start with Vision API similarity score
   - Exact matches in specific labels: +15 points
   - Matching dominant colors: +10 points per color
   - Matching object positions: +10 points
   - High confidence object detection: +10 points
   - Penalties only for severe visual mismatches

2. CATEGORY & DESCRIPTION MATCH (35% of total score):
   Analysis factors:
   - Category exactness
   - Description semantic similarity
   - Brand relationships (e.g., "designer" includes luxury brands like "Gucci", "Prada", etc.)
   - Specific detail matches
   - Condition description
   - Size/color mentions
   Scoring Guidelines:
   - Exact category match: 35 points
   - Related category: 25 points
   - Brand match or related brands (e.g., "designer" = luxury brands): +20 points
   - Specific detail matches: +10 points each
   - Similar descriptive terms: +10 points each

3. TEMPORAL LOGIC (10% of total score):
   Analysis factors:
   - Time difference between lost and found
   - Time of day relevance
   - Day type (weekday/weekend)
   - Seasonal relevance
   Scoring Guidelines:
   - Found after lost: Required
   - Same day: 10 points
   - Within 3 days: 8 points
   - Within week: 6 points
   - Within month: 3 points

4. LOCATION ANALYSIS (10% of total score):
   Analysis factors:
   - Direct distance
   - Travel path feasibility
   - Public transport routes
   - Common movement patterns
   - Area characteristics
   Scoring Guidelines:
   - Same location: 10 points
   - Within 1km: 8 points
   - Within 5km: 6 points
   - Within city: 3 points
   - Different cities: Based on transport links

BRAND RELATIONSHIP RULES:
- "Designer" or "Luxury" descriptions match with: Gucci, Prada, Louis Vuitton, Chanel, Hermes, etc.
- "Sports" brands match with: Nike, Adidas, Puma, Under Armour, etc.
- "Tech" or "Electronics" match with: Apple, Samsung, Sony, etc.

CONFIDENCE SCORE GUIDELINES:
95-100: Near certain match (identical descriptions/images, close time/location)
85-94: Very strong match (highly similar, minor variations)
75-84: Strong match (clear similarities, some variations)
65-74: Probable match (significant similarities, some differences)
55-64: Possible match (some similarities, notable differences)
0-54: Unlikely match (major differences or logical conflicts)

IMPORTANT MATCHING RULES:
1. Visual similarity above 70% should strongly indicate a match
2. Brand relationships (e.g., "designer" = "Gucci") should be treated as near-matches
3. Location within 5km should not significantly penalize the score
4. Time differences within a week should have minimal impact
5. When visual similarity is high, be more lenient with description differences

EVALUATION PROCESS:
1. Start with visual similarity as the base score
2. Add points for matching or related descriptions/categories
3. Apply temporal and location modifiers
4. Consider brand relationships and semantic matches
5. Round to nearest whole number

IMPORTANT: You must respond ONLY with valid JSON in the exact format below:
{"confidenceScore": number, "reasoning": string}

Where:
- confidenceScore is between 0 and 100
- reasoning explains your scoring decision with emphasis on visual similarity and brand relationships
`;

      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text().trim();
      
      try {
        let cleanedResponse = responseText;
        cleanedResponse = cleanedResponse.replace(/```json\s+|\s+```|```/g, '');
        cleanedResponse = cleanedResponse.replace(/`/g, '');
        
        const parsedResponse = JSON.parse(cleanedResponse);
        
        if (typeof parsedResponse.confidenceScore !== 'number' || typeof parsedResponse.reasoning !== 'string') {
          console.error("Invalid response structure from Gemini:", parsedResponse);
          return { confidenceScore: 0, reasoning: "" };
        }
        
        const confidenceScore = Math.min(100, Math.max(0, parsedResponse.confidenceScore));
        return { confidenceScore, reasoning: parsedResponse.reasoning };
      } catch (error) {
        console.error("Error parsing Gemini response:", error);
        console.error("Raw response:", responseText);
        return { confidenceScore: 0, reasoning: "" };
      }
    } catch (error) {
      console.error("Error in evaluateMatch:", error);
      return { confidenceScore: 0, reasoning: "" };
    }
  }
}

const geminiService = new GeminiService();

export default geminiService;
