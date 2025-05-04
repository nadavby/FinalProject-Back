import { IItem } from '../models/item_model';
import geminiService from './gemini-service';
import visionService from './vision-service';
import { shouldSkipComparison } from './matching-service';

/**
 * Service that combines Gemini and Vision APIs for intelligent item matching
 */
class AIMatchingService {
  /**
   * Find potential matches for a given item using AI-powered analysis
   * @param targetItem The item to find matches for
   * @param potentialMatches Array of potential matches to compare against
   * @returns Promise with array of matches and their confidence scores
   */
  async findMatches(
    targetItem: IItem,
    potentialMatches: IItem[]
  ): Promise<{ item: IItem; confidenceScore: number }[]> {
    const matches: { item: IItem; confidenceScore: number }[] = [];
    
    // Filter to compatible item types (lost-found pairs only)
    const compatibleItems = potentialMatches.filter(item => 
      item.itemType !== targetItem.itemType
    );

    console.log(`\n=== Starting Match Analysis ===`);
    console.log(`Looking for matches between ${targetItem.itemType} item and ${compatibleItems.length} potential matches\n`);

    for (const potentialMatch of compatibleItems) {
      try {
        // Determine which item is lost and which is found
        const lostItem = targetItem.itemType === 'lost' ? targetItem : potentialMatch;
        const foundItem = targetItem.itemType === 'found' ? targetItem : potentialMatch;
        
        // Check if basic matching conditions are met before proceeding
        if (shouldSkipComparison(lostItem, foundItem)) {
          continue;
        }

        // Step 1: Perform both text and image comparisons
        const [textComparisonResult, visionResult] = await Promise.all([
          geminiService.compareDescriptions(lostItem, foundItem),
          visionService.compareImages(lostItem.imageUrl, foundItem.imageUrl)
        ]);

        // Step 2: Make final evaluation with all data
        const matchEvaluation = await geminiService.evaluateMatch(
          lostItem,
          foundItem,
          visionResult
        );

        // Log comprehensive evaluation results once
        console.log('\n=== Match Evaluation Results ===');
        console.log('📝 Text Analysis:', textComparisonResult.reason);
        console.log('\n🖼️ Vision Analysis:');
        console.log(`- Similarity Score: ${visionResult.similarityScore}%`);
        if (visionResult.details) {
          console.log(`- Label Match: ${(visionResult.details.labelSimilarity * 100).toFixed(1)}%`);
          console.log(`- Object Match: ${(visionResult.details.objectSimilarity * 100).toFixed(1)}%`);
        }
        console.log('\n📊 Final Score:', matchEvaluation.confidenceScore + '%');
        console.log('Reasoning:', matchEvaluation.reasoning);
        console.log('\n-------------------------------------------\n');
        
        // Add to matches if confidence score is high enough
        if (matchEvaluation.confidenceScore >= 55) {
          matches.push({
            item: potentialMatch,
            confidenceScore: matchEvaluation.confidenceScore
          });
        }
      } catch (error) {
        console.error('Error processing potential match:', error);
        continue;
      }
    }

    // Sort matches by confidence score descending
    const sortedMatches = matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
    
    // Log final results once
    if (sortedMatches.length > 0) {
      console.log(`Found ${sortedMatches.length} high-confidence matches`);
    }

    return sortedMatches;
  }
}

// Create singleton instance
const aiMatchingService = new AIMatchingService();
export default aiMatchingService; 