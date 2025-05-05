import { Request, Response } from 'express';
import itemModel, { IItem } from '../models/item_model';
import userModel from '../models/user_model';
import mongoose from 'mongoose';
import visionService from '../services/vision-service';

interface MatchResult {
  item: IItem;
  score: number;
}

export const compareImages = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { image1Url, image2Url } = req.body;

    if (!image1Url || !image2Url) {
      return res.status(400).json({
        success: false,
        error: 'Both image URLs are required'
      });
    }

    const result = await visionService.compareImages(image1Url, image2Url);

    const significantMatches = [result]
      .filter(match => match.similarityScore >= 30)
      .sort((a, b) => b.similarityScore - a.similarityScore);

    return res.json({
      success: true,
      data: {
        matches: significantMatches.map(match => ({
          score: match.similarityScore,
          details: match.details
        }))
      }
    });

  } catch (error) {
    console.error('Error comparing images:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to compare images'
    });
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
    
    const matches: MatchResult[] = await Promise.all(
      potentialMatches.map(async (potentialMatch) => {
        const result = await visionService.compareImages(item.imageUrl, potentialMatch.imageUrl);
        return {
          item: potentialMatch,
          score: result.similarityScore
        };
      })
    );
    
    const significantMatches = matches
      .filter((match: MatchResult) => match.score >= 30)
      .sort((a: MatchResult, b: MatchResult) => b.score - a.score);
    
    console.log(`Found ${significantMatches.length} significant matches for item ${itemId}`);
    
    return res.status(200).json({
      item,
      matches: significantMatches.map((match: MatchResult) => ({
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

export const analyzeImage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'Image URL is required'
      });
    }

    const analysis = await visionService.getImageAnalysis(imageUrl);

    return res.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error('Error analyzing image:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze image'
    });
  }
};

export const enhanceItemWithAI = async (imageUrl: string) => {
  try {
    const visionAnalysisResult = await visionService.getImageAnalysis(imageUrl);
    const labels = visionAnalysisResult.labels;
    const objects = visionAnalysisResult.objects.map(obj => ({
      name: obj.name,
      score: obj.score,
      boundingBox: obj.boundingBox || {
        x: 0,
        y: 0,
        width: 0,
        height: 0
      }
    }));
    
    return {
      visionApiData: {
        labels,
        objects
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