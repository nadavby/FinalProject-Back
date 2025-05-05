import { IItem } from '../models/item_model';
import geminiService from './gemini-service';
import visionService from './vision-service';
import { shouldSkipComparison } from './matching-service';


class AIMatchingService {
  async findMatches(
    targetItem: IItem,
    potentialMatches: IItem[]
  ): Promise<{ item: IItem; confidenceScore: number }[]> {
    const matches: { item: IItem; confidenceScore: number }[] = [];
    


    console.log(`\n=== Starting Match Analysis ===`);
    console.log(`Looking for matches between ${targetItem.itemType} item and ${potentialMatches.length} potential matches\n`);

    for (const potentialMatch of potentialMatches) {
      try {
        const lostItem = targetItem.itemType === 'lost' ? targetItem : potentialMatch;
        const foundItem = targetItem.itemType === 'found' ? targetItem : potentialMatch;
        
        if (shouldSkipComparison(lostItem, foundItem)) {
          continue;
        }

        const [textComparisonResult, visionResult] = await Promise.all([
          geminiService.compareDescriptions(lostItem, foundItem),
          visionService.compareImages(lostItem.imageUrl, foundItem.imageUrl)
        ]);

        const matchEvaluation = await geminiService.evaluateMatch(
          lostItem,
          foundItem,
          textComparisonResult,
          visionResult
        );

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

    const sortedMatches = matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
    
    if (sortedMatches.length > 0) {
      console.log(`Found ${sortedMatches.length} high-confidence matches`);
    }

    return sortedMatches;
  }
}

const aiMatchingService = new AIMatchingService();
export default aiMatchingService; 