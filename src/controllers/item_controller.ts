/** @format */

import { Request, Response } from "express";
import itemModel, { IItem } from "../models/item_model";
import userModel from "../models/user_model";
import { enhanceItemWithAI } from "./image_comparison_controller";
import { emitNotification } from "../services/socket.service";
import matchingService from "../services/matching-service";
import notificationModel from "../models/notification_model";

const findPotentialMatches = async (
  item: IItem
): Promise<Array<{ item: IItem; score: number }>> => {
  try {
    const oppositeType = item.itemType === "lost" ? "found" : "lost";
    const potentialMatches = await itemModel.find({
      itemType: oppositeType,
      isResolved: false,
    });

    const matches = await matchingService.findMatches(item, potentialMatches);
    const significantMatches = matches
      .filter((match) => match.confidenceScore >= 55)
      .map((match) => ({
        item: match.item,
        score: match.confidenceScore,
      }));
    const highConfidenceMatches = significantMatches.filter(
      (match) => match.score >= 75
    );
    if (highConfidenceMatches.length > 0) {
      const itemOwner = await userModel.findById(item.userId);

      if (itemOwner) {
        const notification = {
          type: "MATCH_FOUND",
          title: "New Potential Matches Found",
          message: `We found ${highConfidenceMatches.length} potential match${highConfidenceMatches.length > 1 ? "es" : ""} for your ${item.itemType} item.`,
          data: {
            matchedItemId: item._id,
            matchCount: highConfidenceMatches.length,
            topScore: Math.max(...highConfidenceMatches.map((m) => m.score)),
          },
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

const formatItemForUI = (item: IItem & { createdAt?: Date }) => {
  let locationStr = '';
  if (typeof item.location === 'string') {
    locationStr = item.location;
  } else if (item.location && typeof item.location === 'object') {
    // אם יש שם עיר או אזור
    if (item.location.city) {
      locationStr = item.location.city;
    } else if (item.location.region) {
      locationStr = item.location.region;
    } else if (item.location.lat && item.location.lng) {
      locationStr = `Lat: ${item.location.lat.toFixed(4)}, Lng: ${item.location.lng.toFixed(4)}`;
    }
  }
  const formattedItem = {
    ...item,
    name: item.description || "",
    imgURL: item.imageUrl || "",
    id: item._id,
    category: item.category || '',
    location: locationStr || '',
    date: item.eventDate || null,
    itemType: item.itemType,
    owner: item.userId
  };
  return formattedItem;
};

const uploadItem = async (req: Request, res: Response) => {
  try {
    console.log("Uploading New Item");

    if (!req.body.userId) {
      console.error("Missing userId in request body");
      return res.status(400).json({
        success: false,
        error: "Missing required field: userId",
      });
    }

    if (!req.body.imageUrl) {
      console.error("Missing imageUrl in request body");
      return res.status(400).json({
        success: false,
        error: "Missing required field: imageUrl",
      });
    }

    if (typeof req.body.imageUrl !== "string" || !req.body.imageUrl.trim()) {
      console.error("Invalid imageUrl format:", req.body.imageUrl);
      return res.status(400).json({
        success: false,
        error: "Invalid imageUrl format",
      });
    }

    if (!req.body.itemType) {
      console.error("Missing itemType in request body");
      return res.status(400).json({
        success: false,
        error: "Missing required field: itemType",
      });
    }

    if (req.body.itemType !== "lost" && req.body.itemType !== "found") {
      console.error("Invalid itemType:", req.body.itemType);
      return res.status(400).json({
        success: false,
        error: "Item type must be 'lost' or 'found'",
      });
    }

    const visionApiData = await enhanceItemWithAI(req.body.imageUrl);

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      console.error("User not found:", req.body.userId);
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    let locationData = req.body.location;
    if (typeof locationData === "string") {
      try {
        locationData = JSON.parse(locationData);
        console.log("Successfully parsed location JSON:", locationData);
      } catch (e) {
        console.error("Failed to parse location JSON:", e);
      }
    }

    const newItem: IItem = {
      userId: req.body.userId,
      imageUrl: req.body.imageUrl,
      itemType: req.body.itemType,
      description: req.body.description || "",
      location: locationData || "",
      category: req.body.category || "",
      ownerName: user.userName,
      ownerEmail: user.email,
      visionApiData: visionApiData.visionApiData,
      isResolved: false,
      eventDate: req.body.eventDate || req.body.date || null,
    };

    const savedItem = await itemModel.create(newItem);
    console.log("Item saved successfully with ID:", savedItem._id);

    let potentialMatches: Array<{ item: IItem; score: number }> = [];
    try {
      potentialMatches = await findPotentialMatches(savedItem);
    } catch (error) {
      console.error("Error finding potential matches:", error);
      potentialMatches = [];
    }

    const response = {
      success: true,
      data: formatItemForUI(savedItem),
      matchResults: potentialMatches.map((match) => ({
        item: formatItemForUI(match.item),
        score: match.score,
      })),
    };

    try {
      if (potentialMatches.length > 0) {
        console.log(
          `Found ${potentialMatches.length} potential matches, sending notifications`
        );

        for (const match of potentialMatches) {
          const matchedItem = match.item;
          const matchOwner = await userModel.findById(matchedItem.userId);

          if (matchOwner) {
            emitNotification(matchedItem.userId, {
              type: "MATCH_FOUND",
              title: "Potential Match Found!",
              message: `We found a potential match for your ${matchedItem.itemType} item!`,
              itemId: matchedItem._id,
              matchId: savedItem._id,
              itemName: matchedItem.description,
              matchName: savedItem.description,
              itemImage: matchedItem.imageUrl,
              matchImage: savedItem.imageUrl,
              score: match.score,
              ownerName: matchedItem.ownerName,
              ownerEmail: matchedItem.ownerEmail,
            });

            // שמירת התראה ב-db
            await notificationModel.create({
              userId: matchedItem.userId,
              type: "MATCH_FOUND",
              title: "Potential Match Found!",
              message: `We found a potential match for your ${matchedItem.itemType} item!`,
              data: {
                itemId: matchedItem._id,
                matchId: savedItem._id,
                itemName: matchedItem.description,
                matchName: savedItem.description,
                itemImage: matchedItem.imageUrl,
                matchImage: savedItem.imageUrl,
                score: match.score,
                ownerName: matchedItem.ownerName,
                ownerEmail: matchedItem.ownerEmail,
              },
            });

            console.log(
              `Sent notification to user ${matchedItem.userId} (${matchOwner.email})`
            );
          }
        }
      }
    } catch (error) {
      console.error("Error notifying matched item owner:", error);
    }

    // שליחת התראה גם למשתמש שמאבד (רק אם יש התאמה)
    if (potentialMatches && potentialMatches.length > 0) {
      emitNotification(savedItem.userId, {
        type: "MATCH_FOUND",
        title: "Potential Match Found!",
        message: `We found a potential match for your ${savedItem.itemType} item!`,
        itemId: savedItem._id,
        matchId: potentialMatches[0].item._id,
        itemName: savedItem.description,
        matchName: potentialMatches[0].item.description,
        itemImage: savedItem.imageUrl,
        matchImage: potentialMatches[0].item.imageUrl,
        score: potentialMatches[0].score,
        ownerName: savedItem.ownerName,
        ownerEmail: savedItem.ownerEmail,
      });
      await notificationModel.create({
        userId: savedItem.userId,
        type: "MATCH_FOUND",
        title: "Potential Match Found!",
        message: `We found a potential match for your ${savedItem.itemType} item!`,
        data: {
          itemId: savedItem._id,
          matchId: potentialMatches[0].item._id,
          itemName: savedItem.description,
          matchName: potentialMatches[0].item.description,
          itemImage: savedItem.imageUrl,
          matchImage: potentialMatches[0].item.imageUrl,
          score: potentialMatches[0].score,
          ownerName: savedItem.ownerName,
          ownerEmail: savedItem.ownerEmail,
        },
      });
    }

    return res.status(201).json(response);
  } catch (error) {
    console.error("Error uploading item:", error);
    return res.status(500).json({
      success: false,
      error: "Error uploading item: " + (error as Error).message,
    });
  }
};

const getAllItems = async (req: Request, res: Response) => {
  try {
    const itemType = req.query.itemType as string;
    const userId = req.query.userId as string;
    console.log('getAllItems - userId:', userId);
    const query: Record<string, unknown> = {};
    if (itemType && (itemType === "lost" || itemType === "found")) {
      query.itemType = itemType;
    }
    if (userId) {
      query.userId = userId;
    }
    console.log('getAllItems - query:', query);
    const items = await itemModel.find(query);
    console.log('getAllItems - items found:', items.length);
    const formattedItems = items.map(formatItemForUI);
    return res.status(200).json(formattedItems);
  } catch (error) {
    console.error("Error getting items:", error);
    return res
      .status(500)
      .send("Error fetching items: " + (error as Error).message);
  }
};

const getItemById = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const item = await itemModel.findById(itemId);

    if (!item) {
      return res.status(404).send("Item not found");
    }

    const formattedItem = formatItemForUI(item);

    return res.status(200).json(formattedItem);
  } catch (error) {
    console.error("Error getting item by ID:", error);
    return res
      .status(500)
      .send("Error fetching item: " + (error as Error).message);
  }
};

const resolveItem = async (req: Request, res: Response) => {
  try {
    const item = await itemModel.findById(req.params.id);
    if (!item) {
      return res.status(404).send("Item not found");
    }

    // אפשר לאשר התאמה אם המשתמש הוא הבעלים של אחד מהפריטים
    let matchedItem = null;
    if (item.matchedItemId) {
      matchedItem = await itemModel.findById(item.matchedItemId);
    }
    const userId = req.body.userId;
    if (item.userId !== userId && (!matchedItem || matchedItem.userId !== userId)) {
      return res.status(403).send("Not authorized to resolve this item");
    }

    item.isResolved = true;
    await item.save();

    if (matchedItem) {
      matchedItem.isResolved = true;
      await matchedItem.save();

      // שליחת התראה לצד השני עם פרטי ההתקשרות
      const otherUserId = item.userId === userId ? matchedItem.userId : item.userId;
      const contactMethod = req.body.contactMethod;
      const contactDetails = req.body.contactDetails;
      const message = req.body.message;
      await notificationModel.create({
        userId: otherUserId,
        type: "MATCH_CONFIRMED",
        title: "Match Confirmed!",
        message: `A match was confirmed. Contact details: ${contactDetails} (${contactMethod})`,
        data: {
          itemId: item._id,
          matchedItemId: matchedItem._id,
          contactMethod,
          contactDetails,
          message,
        },
      });
    }

    res.status(200).json(item);
  } catch (error) {
    console.error("Error resolving item:", error);
    res.status(500).send("Error resolving item: " + (error as Error).message);
  }
};

const updateItem = async (req: Request, res: Response) => {
  try {
    const item = await itemModel.findById(req.params.id);
    if (!item) {
      return res.status(404).send("Item not found");
    }

    if (item.userId !== req.body.userId) {
      return res.status(403).send("Not authorized to update this item");
    }

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

const deleteItem = async (req: Request, res: Response) => {
  try {
    const item = await itemModel.findById(req.params.id);
    if (!item) {
      return res.status(404).send("Item not found");
    }

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

const findMatches = async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        error: "Item ID is required",
      });
    }

    const item = await itemModel.findById(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    const matches = await findPotentialMatches(item);

    const highConfidenceMatches = matches
      .filter((match) => match.score > 70)
      .map((match) => ({
        ...match,
        item: formatItemForUI(match.item),
      }));

    return res.status(200).json({
      success: true,
      matches: highConfidenceMatches,
    });
  } catch (error) {
    console.error("Error finding matches:", error);
    return res.status(500).json({
      success: false,
      error: "Server error while finding matches",
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
  findMatches,
};
