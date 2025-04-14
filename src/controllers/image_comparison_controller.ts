import { Request, Response } from 'express';
import imageComparisonService from '../services/image-comparison.service';
import itemModel from '../models/item_model';
import userModel from '../models/user_model';
import mongoose from 'mongoose';


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

export const findMatches = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.itemId;
    
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: 'Invalid item ID format' });
    }
    
    const item = await itemModel.findById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    const owner = await userModel.findOne({ _id: item.userId });
    if (owner) {
      item.ownerName = owner.userName;
      item.ownerEmail = owner.email;
    }
    
    console.log(`Finding matches for item ${itemId} (${item.itemType})`);
    
    const oppositeType = item.itemType === 'lost' ? 'found' : 'lost';
    const potentialMatches = await itemModel.find({ 
      itemType: oppositeType,
      isResolved: false 
    });
    
    console.log(`Found ${potentialMatches.length} potential ${oppositeType} items to compare`);
    
    for (const match of potentialMatches) {
      const matchOwner = await userModel.findOne({ _id: match.userId });
      if (matchOwner) {
        match.ownerName = matchOwner.userName;
        match.ownerEmail = matchOwner.email;
      }
    }
    
    const matches = await imageComparisonService.findMatchesForItem(item, potentialMatches);
    
    const significantMatches = matches
      .filter(match => match.score >= 30)
      .sort((a, b) => b.score - a.score);
    
    console.log(`Found ${significantMatches.length} significant matches for item ${itemId}`);
    
    return res.status(200).json({
      item,
      matches: significantMatches.map(match => ({
        item: match.item,
        score: match.score,
        matchDetails: {
          visualMatchScore: match.score,
          categoryMatch: match.item.category === item.category,
          locationSimilarity: match.item.location === item.location ? 'high' : 'low'
        }
      }))
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error finding matches:', errorMessage);
    
    if (error instanceof mongoose.Error) {
      console.error('Mongoose error details:', error);
    }
    
    return res.status(500).json({ 
      message: 'Server error processing match request',
      error: errorMessage
    });
  }
};


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


export const enhanceItemWithAI = async (imageUrl: string) => {
  try {
    const analysisResult = await imageComparisonService.analyzeImage(imageUrl);
    
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