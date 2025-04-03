import { Request, Response } from "express";
import itemModel, { IItem } from "../models/item_model";
import axios from "axios";
import userModel from "../models/user_model";

// Function to analyze image using Google Cloud Vision API
const analyzeImage = async (imageUrl: string): Promise<any> => {
  try {
    if (!process.env.GOOGLE_CLOUD_VISION_API_KEY) {
      throw new Error("Google Cloud Vision API key is not set");
    }

    const apiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_CLOUD_VISION_API_KEY}`;
    
    const requestData = {
      requests: [
        {
          image: {
            source: {
              imageUri: imageUrl
            }
          },
          features: [
            { type: "LABEL_DETECTION", maxResults: 10 },
            { type: "OBJECT_LOCALIZATION", maxResults: 10 },
            { type: "IMAGE_PROPERTIES", maxResults: 10 }
          ]
        }
      ]
    };

    const response = await axios.post(apiUrl, requestData);
    
    // Process the response to extract relevant data
    const result = response.data.responses[0];
    
    return {
      labels: result.labelAnnotations?.map((label: any) => label.description) || [],
      objects: result.localizedObjectAnnotations?.map((obj: any) => ({
        name: obj.name,
        score: obj.score,
        boundingBox: {
          x: obj.boundingPoly?.normalizedVertices[0]?.x,
          y: obj.boundingPoly?.normalizedVertices[0]?.y,
          width: obj.boundingPoly?.normalizedVertices[2]?.x - obj.boundingPoly?.normalizedVertices[0]?.x,
          height: obj.boundingPoly?.normalizedVertices[2]?.y - obj.boundingPoly?.normalizedVertices[0]?.y
        }
      })) || [],
      colors: result.imagePropertiesAnnotation?.dominantColors?.colors?.map((color: any) => ({
        color: `rgb(${Math.round(color.color.red)}, ${Math.round(color.color.green)}, ${Math.round(color.color.blue)})`,
        score: color.score
      })) || [],
      imageProperties: result.imagePropertiesAnnotation
    };
  } catch (error) {
    console.error("Error analyzing image:", error);
    return {
      labels: [],
      objects: [],
      colors: []
    };
  }
};

// Function to calculate similarity score between two image analysis results
const calculateSimilarityScore = (item1: IItem, item2: IItem): number => {
  if (!item1.visionApiData || !item2.visionApiData) return 0;

  let score = 0;
  const maxScore = 100;

  // Compare labels (50% of total score)
  const labels1 = item1.visionApiData.labels || [];
  const labels2 = item2.visionApiData.labels || [];
  
  const commonLabels = labels1.filter(label => labels2.includes(label));
  const labelScore = (commonLabels.length / Math.max(labels1.length, 1)) * 50;
  score += labelScore;

  // Compare objects (30% of total score)
  const objects1 = item1.visionApiData.objects?.map(obj => obj.name.toLowerCase()) || [];
  const objects2 = item2.visionApiData.objects?.map(obj => obj.name.toLowerCase()) || [];
  
  const commonObjects = objects1.filter(obj => objects2.includes(obj));
  const objectScore = (commonObjects.length / Math.max(objects1.length, 1)) * 30;
  score += objectScore;

  // Compare colors (20% of total score)
  const colors1 = item1.visionApiData.colors || [];
  const colors2 = item2.visionApiData.colors || [];
  
  // Simple color comparison based on the top 3 colors
  const topColors1 = colors1.slice(0, 3).map(c => c.color);
  const topColors2 = colors2.slice(0, 3).map(c => c.color);
  
  const commonColors = topColors1.filter(color => {
    // Check if a similar color exists in the other set
    return topColors2.some(color2 => {
      // Parse the RGB values
      const rgb1 = color.replace(/^rgb\(|\)$/g, '').split(', ').map(Number);
      const rgb2 = color2.replace(/^rgb\(|\)$/g, '').split(', ').map(Number);
      
      // Calculate the Euclidean distance between the colors
      const distance = Math.sqrt(
        Math.pow(rgb1[0] - rgb2[0], 2) +
        Math.pow(rgb1[1] - rgb2[1], 2) +
        Math.pow(rgb1[2] - rgb2[2], 2)
      );
      
      // Consider colors similar if their distance is less than a threshold
      return distance < 100;
    });
  });
  
  const colorScore = (commonColors.length / Math.max(topColors1.length, 1)) * 20;
  score += colorScore;

  return Math.min(score, maxScore);
};

// Function to find potential matches for an item
const findPotentialMatches = async (item: IItem): Promise<Array<{ item: IItem, score: number }>> => {
  try {
    // Find items of the opposite type (lost/found)
    const oppositeType = item.itemType === 'lost' ? 'found' : 'lost';
    const potentialMatches = await itemModel.find({ 
      itemType: oppositeType,
      isResolved: false 
    });
    
    // Calculate similarity scores for each potential match
    const scoredMatches = potentialMatches.map(match => ({
      item: match,
      score: calculateSimilarityScore(item, match)
    }));
    
    // Sort by score (descending) and return top matches
    return scoredMatches.sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error("Error finding potential matches:", error);
    return [];
  }
};

// Controller function to upload a new lost or found item
const uploadItem = async (req: Request, res: Response) => {
  try {
    if (!req.body.userId || !req.body.imageUrl || !req.body.itemType) {
      return res.status(400).send("Missing required fields");
    }

    if (req.body.itemType !== 'lost' && req.body.itemType !== 'found') {
      return res.status(400).send("Item type must be 'lost' or 'found'");
    }

    // Analyze the image using Google Cloud Vision API
    const visionApiData = await analyzeImage(req.body.imageUrl);

    // Create new item
    const newItem: IItem = {
      userId: req.body.userId,
      imageUrl: req.body.imageUrl,
      itemType: req.body.itemType,
      description: req.body.description,
      location: req.body.location,
      category: req.body.category,
      visionApiData: visionApiData,
      isResolved: false
    };

    const savedItem = await itemModel.create(newItem);

    // Find potential matches
    const potentialMatches = await findPotentialMatches(savedItem);
    
    // If we have high-confidence matches, update the item with the best match
    if (potentialMatches.length > 0 && potentialMatches[0].score > 70) {
      const bestMatch = potentialMatches[0];
      
      savedItem.matchedItemId = bestMatch.item._id;
      await savedItem.save();
      
      // Notify the owner of the matched item
      try {
        const matchedItemOwner = await userModel.findOne({ _id: bestMatch.item.userId });
        if (matchedItemOwner) {
          // In a real implementation, send an email or push notification
          console.log(`Match found! Notifying user: ${matchedItemOwner.email}`);
        }
      } catch (err) {
        console.error("Error notifying matched item owner:", err);
      }
    }

    // Return the created item along with potential matches
    return res.status(201).json({
      item: savedItem,
      potentialMatches: potentialMatches.filter(match => match.score > 50).slice(0, 5)
    });
  } catch (error) {
    console.error("Error uploading item:", error);
    return res.status(500).send("Error uploading item: " + (error as Error).message);
  }
};

// Controller function to get all items
const getAllItems = async (req: Request, res: Response) => {
  try {
    const itemType = req.query.itemType as string;
    const userId = req.query.userId as string;
    
    let query: any = {};
    
    if (itemType && (itemType === 'lost' || itemType === 'found')) {
      query.itemType = itemType;
    }
    
    if (userId) {
      query.userId = userId;
    }
    
    const items = await itemModel.find(query).sort({ createdAt: -1 });
    res.status(200).json(items);
  } catch (error) {
    console.error("Error getting items:", error);
    res.status(500).send("Error getting items: " + (error as Error).message);
  }
};

// Controller function to get a specific item by ID
const getItemById = async (req: Request, res: Response) => {
  try {
    const item = await itemModel.findById(req.params.id);
    if (!item) {
      return res.status(404).send("Item not found");
    }
    
    // If this item has a matched item, include it in the response
    let matchedItem = null;
    if (item.matchedItemId) {
      matchedItem = await itemModel.findById(item.matchedItemId);
    }
    
    res.status(200).json({ item, matchedItem });
  } catch (error) {
    console.error("Error getting item:", error);
    res.status(500).send("Error getting item: " + (error as Error).message);
  }
};

// Controller function to mark an item as resolved
const resolveItem = async (req: Request, res: Response) => {
  try {
    const item = await itemModel.findById(req.params.id);
    if (!item) {
      return res.status(404).send("Item not found");
    }
    
    // Check if the user is the owner of the item
    if (item.userId !== req.body.userId) {
      return res.status(403).send("Not authorized to resolve this item");
    }
    
    item.isResolved = true;
    await item.save();
    
    // If this item has a matched item, mark it as resolved too
    if (item.matchedItemId) {
      const matchedItem = await itemModel.findById(item.matchedItemId);
      if (matchedItem) {
        matchedItem.isResolved = true;
        await matchedItem.save();
      }
    }
    
    res.status(200).json(item);
  } catch (error) {
    console.error("Error resolving item:", error);
    res.status(500).send("Error resolving item: " + (error as Error).message);
  }
};

// Controller function to update an item
const updateItem = async (req: Request, res: Response) => {
  try {
    const item = await itemModel.findById(req.params.id);
    if (!item) {
      return res.status(404).send("Item not found");
    }
    
    // Check if the user is the owner of the item
    if (item.userId !== req.body.userId) {
      return res.status(403).send("Not authorized to update this item");
    }
    
    // Update allowed fields
    if (req.body.description) item.description = req.body.description;
    if (req.body.location) item.location = req.body.location;
    if (req.body.category) item.category = req.body.category;
    
    await item.save();
    res.status(200).json(item);
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).send("Error updating item: " + (error as Error).message);
  }
};

// Controller function to delete an item
const deleteItem = async (req: Request, res: Response) => {
  try {
    const item = await itemModel.findById(req.params.id);
    if (!item) {
      return res.status(404).send("Item not found");
    }
    
    // Check if the user is the owner of the item
    if (item.userId !== req.body.userId) {
      return res.status(403).send("Not authorized to delete this item");
    }
    
    await itemModel.findByIdAndDelete(req.params.id);
    res.status(200).send("Item deleted successfully");
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).send("Error deleting item: " + (error as Error).message);
  }
};

export {
  uploadItem,
  getAllItems,
  getItemById,
  resolveItem,
  updateItem,
  deleteItem
}; 