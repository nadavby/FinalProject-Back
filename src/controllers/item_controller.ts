import { Request, Response } from "express";
import itemModel, { IItem } from "../models/item_model";
import userModel from "../models/user_model";
import { enhanceItemWithAI } from "./image_comparison_controller";
import { emitNotification } from "../services/socket.service";
import matchingService from "../services/matching-service";

// Function to find potential matches for an item
const findPotentialMatches = async (item: IItem): Promise<Array<{ item: IItem, score: number }>> => {
  try {
    // Find items of the opposite type (lost/found)
    const oppositeType = item.itemType === 'lost' ? 'found' : 'lost';
    const potentialMatches = await itemModel.find({ 
      itemType: oppositeType,
      isResolved: false 
    });
    
    // Use the new AI-powered matching service for more accurate matching
    const matches = await matchingService.findMatches(item, potentialMatches);
    
    // Filter out low confidence matches and convert to expected format
    const significantMatches = matches
      .filter(match => match.confidenceScore >= 55)
      .map(match => ({
        item: match.item,
        score: match.confidenceScore
      }));

    // Only notify about high confidence matches (>= 75%)
    const highConfidenceMatches = significantMatches.filter(match => match.score >= 75);
    if (highConfidenceMatches.length > 0) {
      // Get owner information for notifications
      const itemOwner = await userModel.findById(item.userId);
      
      // Only send one notification per user for all matches
      if (itemOwner) {
        const notification = {
          type: 'MATCH_FOUND',
          title: 'New Potential Matches Found',
          message: `We found ${highConfidenceMatches.length} potential match${highConfidenceMatches.length > 1 ? 'es' : ''} for your ${item.itemType} item.`,
          data: {
            matchedItemId: item._id,
            matchCount: highConfidenceMatches.length,
            topScore: Math.max(...highConfidenceMatches.map(m => m.score))
          }
        };
        emitNotification(itemOwner._id.toString(), notification);
      }
    }

    return significantMatches;
  } catch (error) {
    console.error("Error finding potential matches:", error);
    return [];
  }
};

// Helper function to format items for the frontend
const formatItemForUI = (item: IItem) => {
  // Create a properly typed version with all properties from the original item
  const formattedItem = {
    ...item,
    // Add UI-friendly field names while keeping the original properties
    name: item.description || '',
    imgURL: item.imageUrl || '',
    id: item._id
  };
  
  return formattedItem;
};

// Controller function to upload a new lost or found item
const uploadItem = async (req: Request, res: Response) => {
  try {
    // Detailed request logging
    console.log("Uploading New Item");
    
    // Validate required fields
    if (!req.body.userId) {
      console.error("Missing userId in request body");
      return res.status(400).json({
        success: false,
        error: "Missing required field: userId"
      });
    }
    
    if (!req.body.imageUrl) {
      console.error("Missing imageUrl in request body");
      return res.status(400).json({
        success: false,
        error: "Missing required field: imageUrl"
      });
    }
    
    // Validate the imageUrl is properly formatted
    if (typeof req.body.imageUrl !== 'string' || !req.body.imageUrl.trim()) {
      console.error("Invalid imageUrl format:", req.body.imageUrl);
      return res.status(400).json({
        success: false,
        error: "Invalid imageUrl format"
      });
    }
    
    if (!req.body.itemType) {
      console.error("Missing itemType in request body");
      return res.status(400).json({
        success: false,
        error: "Missing required field: itemType"
      });
    }

    if (req.body.itemType !== 'lost' && req.body.itemType !== 'found') {
      console.error("Invalid itemType:", req.body.itemType);
      return res.status(400).json({
        success: false,
        error: "Item type must be 'lost' or 'found'"
      });
    }

    // Analyze the image using our enhanced AI service
    const visionApiData = await enhanceItemWithAI(req.body.imageUrl);
    
    // Get user information to add owner details
    const user = await userModel.findById(req.body.userId);
    if (!user) {
      console.error("User not found:", req.body.userId);
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Parse the location data properly if it's a string
    let locationData = req.body.location;
    if (typeof locationData === 'string') {
      try {
        locationData = JSON.parse(locationData);
        console.log("Successfully parsed location JSON:", locationData);
      } catch (e) {
        console.error("Failed to parse location JSON:", e);
        // If parsing fails, keep it as a string
      }
    }

    // Create new item (with safer property access)
    const newItem: IItem = {
      userId: req.body.userId,
      imageUrl: req.body.imageUrl,
      itemType: req.body.itemType,
      description: req.body.description || "",
      location: locationData || "", // This will be either the parsed object or the original string
      category: req.body.category || "",
      // Add owner contact information
      ownerName: user.userName,
      ownerEmail: user.email,
      visionApiData: visionApiData.visionApiData,
      isResolved: false
    };

    const savedItem = await itemModel.create(newItem);
    console.log("Item saved successfully with ID:", savedItem._id);

    // Find potential matches using our enhanced comparison
    let potentialMatches: Array<{ item: IItem, score: number }> = [];
    try {
      potentialMatches = await findPotentialMatches(savedItem);
    } catch (error) {
      console.error("Error finding potential matches:", error);
      // Continue without matches
      potentialMatches = [];
    }

    // Format for consistent frontend response
    const response = {
      success: true,
      data: formatItemForUI(savedItem),
      matchResults: potentialMatches.map(match => ({
        item: formatItemForUI(match.item),
        score: match.score
      }))
    };

    // Send notifications for high-confidence matches
    try {
      const highConfidenceMatches = potentialMatches.filter(match => match.score > 70);
      
      if (highConfidenceMatches.length > 0) {
        console.log(`Found ${highConfidenceMatches.length} high-confidence matches, sending notifications`);
        
        for (const match of highConfidenceMatches) {
          const matchedItem = match.item;
          const matchOwner = await userModel.findById(matchedItem.userId);
          
          if (matchOwner) {
            // Emit socket notification to the matched item owner
            emitNotification(matchedItem.userId, {
              type: 'MATCH_FOUND',
              title: 'Potential Match Found!',
              message: `We found a potential match for your ${matchedItem.itemType} item!`,
              itemId: matchedItem._id,
              matchId: savedItem._id,
              itemName: matchedItem.description,
              matchName: savedItem.description,
              itemImage: matchedItem.imageUrl,
              matchImage: savedItem.imageUrl,
              score: match.score,
              ownerName: matchedItem.ownerName,
              ownerEmail: matchedItem.ownerEmail
            });
            
            console.log(`Sent notification to user ${matchedItem.userId} (${matchOwner.email})`);
          }
        }
      }
    } catch (error) {
      console.error("Error notifying matched item owner:", error);
      // Continue without sending notifications
    }

    return res.status(201).json(response);
  } catch (error) {
    console.error("Error uploading item:", error);
    return res.status(500).json({
      success: false,
      error: "Error uploading item: " + (error as Error).message
    });
  }
};

// Controller function to get all items
const getAllItems = async (req: Request, res: Response) => {
  try {
    const itemType = req.query.itemType as string;
    const userId = req.query.userId as string;
    
    const query: Record<string, unknown> = {};
    
    if (itemType && (itemType === 'lost' || itemType === 'found')) {
      query.itemType = itemType;
    }
    
    if (userId) {
      query.userId = userId;
    }
    
    const items = await itemModel.find(query);
    
    // Format items for the frontend
    const formattedItems = items.map(formatItemForUI);
    
    return res.status(200).json(formattedItems);
  } catch (error) {
    console.error("Error getting items:", error);
    return res.status(500).send("Error fetching items: " + (error as Error).message);
  }
};

// Controller function to get a specific item by ID
const getItemById = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const item = await itemModel.findById(itemId);
    
    if (!item) {
      return res.status(404).send("Item not found");
    }
    
    // Format item for the frontend
    const formattedItem = formatItemForUI(item);
    
    return res.status(200).json(formattedItem);
  } catch (error) {
    console.error("Error getting item by ID:", error);
    return res.status(500).send("Error fetching item: " + (error as Error).message);
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
    res.status(200).json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).send("Error deleting item: " + (error as Error).message);
  }
};

// Add a dedicated endpoint for finding matches
const findMatches = async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    
    // Validate item ID
    if (!itemId) {
      return res.status(400).json({
        success: false,
        error: "Item ID is required"
      });
    }
    
    // Get the item
    const item = await itemModel.findById(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: "Item not found"
      });
    }
    
    // Find potential matches
    const matches = await findPotentialMatches(item);
    
    // Return only high confidence matches (score > 70)
    const highConfidenceMatches = matches
      .filter(match => match.score > 70)
      .map(match => ({
        ...match,
        item: formatItemForUI(match.item)
      }));
    
    return res.status(200).json({
      success: true,
      matches: highConfidenceMatches
    });
  } catch (error) {
    console.error("Error finding matches:", error);
    return res.status(500).json({
      success: false,
      error: "Server error while finding matches"
    });
  }
};

export {
  uploadItem,
  getAllItems,
  getItemById,
  resolveItem,
  updateItem,
  deleteItem,
  findMatches
}; 