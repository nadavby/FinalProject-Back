import { IItem } from '../models/item_model';
import aiMatchingService from './ai-matching-service';

// Distance calculation using Haversine formula
const calculateDistanceInKm = (
  location1: { lat: number; lng: number } | string | undefined,
  location2: { lat: number; lng: number } | string | undefined
): number => {
  if (!location1 || !location2 || typeof location1 === 'string' || typeof location2 === 'string') {
    return Infinity; // Cannot calculate distance
  }

  const R = 6371; // Earth radius in KM
  const dLat = ((location2.lat - location1.lat) * Math.PI) / 180;
  const dLon = ((location2.lng - location1.lng) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((location1.lat * Math.PI) / 180) *
    Math.cos((location2.lat * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Check if we should skip the detailed comparison based on basic filters
 * @param lostItem The lost item
 * @param foundItem The found item
 * @returns boolean indicating if we should skip comparing these items
 */
export const shouldSkipComparison = (lostItem: IItem, foundItem: IItem): boolean => {
  // Don't compare already resolved items
  if (lostItem.isResolved || foundItem.isResolved) return true;

  // Skip if the timestamps don't make sense (found before lost)
  if (lostItem.timestamp && foundItem.timestamp && 
      new Date(foundItem.timestamp) < new Date(lostItem.timestamp)) {
    return true;
  }

  // Skip if categories are different
  if (lostItem.category && foundItem.category && 
      lostItem.category !== foundItem.category) {
    return true;
  }

  // Skip if items are too far apart (100km)
  const distance = calculateDistanceInKm(lostItem.location, foundItem.location);
  if (distance < Infinity && distance > 100) {
    return true;
  }

  return false;
};

/**
 * Main service for matching lost and found items
 */
class MatchingService {
  /**
   * Find potential matches for a given item
   * @param targetItem The item to find matches for
   * @param potentialMatches Array of potential matches to compare against
   * @returns Promise with array of matches and their confidence scores
   */
  async findMatches(
    targetItem: IItem,
    potentialMatches: IItem[]
  ): Promise<{ item: IItem; confidenceScore: number }[]> {
    try {
      // Use our AI matching service which combines Gemini and Vision APIs
      return await aiMatchingService.findMatches(targetItem, potentialMatches);
    } catch (error) {
      console.error('Error in AI matching service:', error);
      
      // Fallback to basic matching if AI matching fails
      console.log('Falling back to basic matching logic');
      
      const matches: { item: IItem; confidenceScore: number }[] = [];
      
      // Filter to compatible item types (lost-found pairs only)
      const compatibleItems = potentialMatches.filter(item => 
        item.itemType !== targetItem.itemType
      );
      
      for (const potentialMatch of compatibleItems) {
        // Check if basic matching conditions are met
        const lostItem = targetItem.itemType === 'lost' ? targetItem : potentialMatch;
        const foundItem = targetItem.itemType === 'found' ? targetItem : potentialMatch;
        
        if (shouldSkipComparison(lostItem, foundItem)) {
          continue;
        }
        
        // Basic matching: check same category and nearby location
        let score = 0;
        
        // Category match adds 40 points
        if (lostItem.category && foundItem.category && 
            lostItem.category === foundItem.category) {
          score += 40;
        }
        
        // Location proximity (if available) adds up to 40 points
        const distance = calculateDistanceInKm(lostItem.location, foundItem.location);
        if (distance < Infinity) {
          // Scale: 0km = 40 points, 100km = 0 points
          const locationScore = Math.max(0, 40 - (distance * 0.4));
          score += locationScore;
        }
        
        // Description similarity (very basic) adds up to 20 points
        if (lostItem.description && foundItem.description) {
          const lostWords = new Set(lostItem.description.toLowerCase().split(/\s+/));
          const foundWords = foundItem.description.toLowerCase().split(/\s+/);
          
          let matchingWords = 0;
          for (const word of foundWords) {
            if (lostWords.has(word) && word.length > 2) {
              matchingWords++;
            }
          }
          
          const descriptionScore = Math.min(20, matchingWords * 5);
          score += descriptionScore;
        }
        
        if (score > 0) {
          matches.push({
            item: potentialMatch,
            confidenceScore: score
          });
        }
      }
      
      // Sort matches by confidence score (descending)
      return matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
    }
  }
}

// Create singleton instance
const matchingService = new MatchingService();

export default matchingService; 