import { Request, Response } from 'express';
import imageComparisonService from '../services/image-comparison.service';
import itemModel from '../models/item_model';
import mongoose from 'mongoose';

/**
 * Compare two images by URL
 * @param req Request with image URLs
 * @param res Response with comparison result
 */
export const compareImages = async (req: Request, res: Response) => {
  try {
    const { image1Url, image2Url } = req.body;
    
    if (!image1Url || !image2Url) {
      return res.status(400).send('Both image URLs are required');
    }
    
    const result = await imageComparisonService.compareImages(image1Url, image2Url);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error comparing images:', error);
    return res.status(500).send('Error comparing images: ' + (error as Error).message);
  }
};

/**
 * Find potential matches for a specific item
 * @param req Request with item ID
 * @param res Response with potential matches
 */
export const findMatches = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).send('Invalid item ID');
    }
    
    const item = await itemModel.findById(itemId);
    if (!item) {
      return res.status(404).send('Item not found');
    }
    
    // Get opposite type items (lost vs found)
    const oppositeType = item.itemType === 'lost' ? 'found' : 'lost';
    const potentialMatches = await itemModel.find({ 
      itemType: oppositeType,
      isResolved: false 
    });
    
    const matches = await imageComparisonService.findMatchesForItem(item, potentialMatches);
    
    return res.status(200).json({
      item,
      matches: matches.map(match => ({
        item: match.item,
        score: match.score
      }))
    });
  } catch (error) {
    console.error('Error finding matches:', error);
    return res.status(500).send('Error finding matches: ' + (error as Error).message);
  }
};

/**
 * Analyze an image using Google Cloud Vision API
 * @param req Request with image URL
 * @param res Response with analysis result
 */
export const analyzeImage = async (req: Request, res: Response) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).send('Image URL is required');
    }
    
    const result = await imageComparisonService.analyzeImage(imageUrl);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error analyzing image:', error);
    return res.status(500).send('Error analyzing image: ' + (error as Error).message);
  }
};

/**
 * Enhance the item upload process with AI object detection
 * This function should be added to the existing item upload flow
 */
export const enhanceItemWithAI = async (imageUrl: string) => {
  try {
    const analysisResult = await imageComparisonService.analyzeImage(imageUrl);
    
    // Return enhanced data that can be stored with the item
    return {
      visionApiData: {
        labels: analysisResult.labels,
        objects: analysisResult.objects,
      }
    };
  } catch (error) {
    console.error('Error enhancing item with AI:', error);
    return {
      visionApiData: {
        labels: [],
        objects: []
      }
    };
  }
}; 