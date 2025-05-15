import { IItem } from '../models/item_model';
import aiMatchingService from './ai-matching-service';

const calculateDistanceInKm = (
  location1: { lat: number; lng: number } | string | undefined,
  location2: { lat: number; lng: number } | string | undefined
): number => {
  if (!location1 || !location2 || typeof location1 === 'string' || typeof location2 === 'string') {
    return Infinity; 
  }

  const R = 6371; 
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

// פונקציה גלובלית לבדוק אם location תקין
const validLocation = (loc: any) => typeof loc === 'object' && typeof loc.lat === 'number' && typeof loc.lng === 'number';

export const shouldSkipComparison = (lostItem: IItem, foundItem: IItem): boolean => {
  if (lostItem.isResolved || foundItem.isResolved) return true;

  if (lostItem.timestamp && foundItem.timestamp && 
      new Date(foundItem.timestamp) < new Date(lostItem.timestamp)) {
    return true;
  }

  if (lostItem.category && foundItem.category && 
      lostItem.category !== foundItem.category) {
    return true;
  }

  let distance = Infinity;
  if (validLocation(lostItem.location) && validLocation(foundItem.location)) {
    distance = calculateDistanceInKm(
      { lat: (lostItem.location as any).lat, lng: (lostItem.location as any).lng },
      { lat: (foundItem.location as any).lat, lng: (foundItem.location as any).lng }
    );
  }
  if (distance < Infinity && distance > 100) {
    return true;
  }

  return false;
};


class MatchingService {
  async findMatches(
    targetItem: IItem,
    potentialMatches: IItem[]
  ): Promise<{ item: IItem; confidenceScore: number }[]> {
    try {
      return await aiMatchingService.findMatches(targetItem, potentialMatches);
    } catch (error) {
      console.error('Error in AI matching service:', error);
      console.log('Falling back to basic matching logic');
      const matches: { item: IItem; confidenceScore: number }[] = [];
      const compatibleItems = potentialMatches.filter(item => 
        item.itemType !== targetItem.itemType
      );
      
      for (const potentialMatch of compatibleItems) {
        const lostItem = targetItem.itemType === 'lost' ? targetItem : potentialMatch;
        const foundItem = targetItem.itemType === 'found' ? targetItem : potentialMatch;
        
        if (shouldSkipComparison(lostItem, foundItem)) {
          continue;
        }
        
        let score = 0;
        
        if (lostItem.category && foundItem.category && 
            lostItem.category === foundItem.category) {
          score += 40;
        }
        
        let distance = Infinity;
        if (validLocation(lostItem.location) && validLocation(foundItem.location)) {
          distance = calculateDistanceInKm(
            { lat: (lostItem.location as any).lat, lng: (lostItem.location as any).lng },
            { lat: (foundItem.location as any).lat, lng: (foundItem.location as any).lng }
          );
        }
        if (distance < Infinity) {
          const locationScore = Math.max(0, 40 - (distance * 0.4));
          score += locationScore;
        }
        
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
      
      return matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
    }
  }
}

const matchingService = new MatchingService();

export default matchingService; 