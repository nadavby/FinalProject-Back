/** @format */

import express from "express";
import { uploadItem, getAllItems, getItemById, resolveItem, updateItem, deleteItem } from "../controllers/item_controller";
import { authMiddleware } from "../controllers/auth_controller";
import multer from "multer";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Items
 *   description: Lost and found items API
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Item:
 *       type: object
 *       required:
 *         - userId
 *         - imageUrl
 *         - itemType
 *       properties:
 *         _id:
 *           type: string
 *           description: The auto-generated ID of the item
 *         userId:
 *           type: string
 *           description: The ID of the user who uploaded the item
 *         imageUrl:
 *           type: string
 *           description: URL of the item image
 *         itemType:
 *           type: string
 *           enum: [lost, found]
 *           description: Whether the item is lost or found
 *         description:
 *           type: string
 *           description: Optional description of the item
 *         location:
 *           type: string
 *           description: Optional location where the item was lost/found
 *         category:
 *           type: string
 *           description: Optional category of the item
 *         visionApiData:
 *           type: object
 *           description: Data from Google Cloud Vision API analysis
 *         matchedItemId:
 *           type: string
 *           description: ID of a matching item if found
 *         isResolved:
 *           type: boolean
 *           description: Whether the lost/found case is resolved
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The date the item was uploaded
 *       example:
 *         _id: 60d21b4667d0d8992e610c85
 *         userId: 60d0fe4f5311236168a109ca
 *         imageUrl: http://example.com/public/items/1624365062087.jpg
 *         itemType: lost
 *         description: Red wallet with ID cards
 *         location: Central Park
 *         category: Wallet
 *         isResolved: false
 *         createdAt: 2023-01-01T19:00:00.000Z
 */

// Set up the storage for item images
const base = process.env.DOMAIN_BASE + "/";
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/items");
  },
  filename: function (req, file, cb) {
    const ext = file.originalname
      .split(".")
      .filter(Boolean)
      .slice(1)
      .join(".");
    cb(null, Date.now() + "." + ext);
  },
});

// Configure multer to be more flexible with field names
const upload = multer({ 
  storage: storage,
  fileFilter: function(req, file, cb) {
    // Log the field name for debugging
    console.log("Received file with field name:", file.fieldname);
    cb(null, true);
  }
});

/**
 * @swagger
 * /items/upload-item:
 *   post:
 *     summary: Upload a new lost or found item
 *     description: Upload an image of a lost or found item for processing and matching
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - itemType
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Image of the item
 *               itemType:
 *                 type: string
 *                 enum: [lost, found]
 *                 description: Whether the item is lost or found
 *               description:
 *                 type: string
 *                 description: Description of the item
 *               location:
 *                 type: string
 *                 description: Location where the item was lost/found
 *               category:
 *                 type: string
 *                 description: Category of the item
 *     responses:
 *       201:
 *         description: Item uploaded successfully with potential matches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/Item'
 *                 potentialMatches:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       item:
 *                         $ref: '#/components/schemas/Item'
 *                       score:
 *                         type: number
 *                         description: Similarity score (0-100)
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post("/upload-item", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    // Log the request body and files for debugging
    console.log("Request body:", JSON.stringify(req.body));
    console.log("Request file:", req.file);
    
    if (!req.file) {
      return res.status(400).send("Missing required file");
    }
    
    // Debug authentication
    console.log("User authenticated with ID:", req.userId);
    
    const imageUrl = base + req.file.path;
    req.body.imageUrl = imageUrl;
    req.body.userId = req.body.userId || req.userId; // Use authenticated user ID if not provided
    
    // Parse location field if it's a JSON string
    if (req.body.location && typeof req.body.location === 'string') {
      try {
        req.body.location = JSON.parse(req.body.location);
        console.log("Successfully parsed location JSON:", req.body.location);
      } catch (e) {
        console.error("Failed to parse location JSON:", e);
        // Keep it as a string if parsing fails
      }
    }
    
    return uploadItem(req, res);
  } catch (error) {
    console.error("Error in upload-item route:", error);
    return res.status(500).send("Error uploading item: " + (error as Error).message);
  }
});

/**
 * @swagger
 * /items:
 *   post:
 *     summary: Add a new lost or found item
 *     description: Alternative endpoint to upload-item, with the same functionality
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - itemType
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Image of the item
 *               itemType:
 *                 type: string
 *                 enum: [lost, found]
 *                 description: Whether the item is lost or found
 *               description:
 *                 type: string
 *                 description: Description of the item
 *               location:
 *                 type: string
 *                 description: Location where the item was lost/found
 *               category:
 *                 type: string
 *                 description: Category of the item
 *     responses:
 *       201:
 *         description: Item uploaded successfully with potential matches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/Item'
 *                 potentialMatches:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       item:
 *                         $ref: '#/components/schemas/Item'
 *                       score:
 *                         type: number
 *                         description: Similarity score (0-100)
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post("/", authMiddleware, upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log("Processing item upload with authorization:", req.header("authorization") ? "Present" : "Missing");
    console.log("Request body:", JSON.stringify(req.body));
    console.log("Request files:", req.files);
    
    // Get the file from either the "file" or "image" field
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const file = files?.file?.[0] || files?.image?.[0];
    
    if (!file) {
      return res.status(400).send("Missing required file. Please upload an image with field name 'file' or 'image'.");
    }
    
    // Debug authentication
    console.log("User authenticated with ID:", req.userId);
    
    const imageUrl = base + file.path;
    req.body.imageUrl = imageUrl;
    req.body.userId = req.body.userId || req.userId; // Use authenticated user ID if not provided
    
    // Map frontend field names to backend field names
    if (req.body.name) {
      req.body.description = req.body.description || req.body.name;
    }
    
    if (req.body.category) {
      req.body.category = req.body.category;
    }
    
    if (req.body.location) {
      // Handle location which might be a JSON string or already an object
      if (typeof req.body.location === 'string') {
        try {
          req.body.location = JSON.parse(req.body.location);
        } catch (e) {
          console.error("Failed to parse location JSON:", e);
          // Keep it as is if parsing fails
        }
      }
    }
    
    if (req.body.date) {
      // Store date information if provided
      console.log("Received date:", req.body.date);
    }
    
    if (req.body.itemType) {
      // Normalize itemType to lowercase
      req.body.itemType = req.body.itemType.toLowerCase();
    } else if (req.body.kind) {
      // Map 'kind' field to 'itemType' if present
      req.body.itemType = req.body.kind.toLowerCase();
    }
    
    // Store the file in req.file for compatibility with the controller
    req.file = file;
    
    // Verify required fields are present
    if (!req.body.itemType) {
      return res.status(400).send("Missing required field: itemType");
    }
    
    if (req.body.itemType !== 'lost' && req.body.itemType !== 'found') {
      return res.status(400).send("Item type must be 'lost' or 'found'");
    }
    
    // Log the processed data before passing to controller
    console.log("Processed data for controller:", {
      userId: req.body.userId,
      imageUrl: req.body.imageUrl,
      itemType: req.body.itemType,
      description: req.body.description,
      location: req.body.location,
      category: req.body.category
    });
    
    return uploadItem(req, res);
  } catch (error) {
    console.error("Error in /items POST route:", error);
    return res.status(500).send("Error uploading item: " + (error as Error).message);
  }
});

/**
 * @swagger
 * /items:
 *   get:
 *     summary: Get all items
 *     description: Retrieve a list of all lost and found items with optional filtering
 *     tags: [Items]
 *     parameters:
 *       - in: query
 *         name: itemType
 *         schema:
 *           type: string
 *           enum: [lost, found]
 *         description: Filter by item type
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *     responses:
 *       200:
 *         description: A list of items
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Item'
 *       500:
 *         description: Server error
 */
router.get("/", getAllItems);

/**
 * @swagger
 * /items/lost:
 *   get:
 *     summary: Get all lost items
 *     description: Retrieve a list of all lost items
 *     tags: [Items]
 *     responses:
 *       200:
 *         description: A list of lost items
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Item'
 *       500:
 *         description: Server error
 */
router.get("/lost", (req, res) => {
  req.query.itemType = "lost";
  return getAllItems(req, res);
});

/**
 * @swagger
 * /items/found:
 *   get:
 *     summary: Get all found items
 *     description: Retrieve a list of all found items
 *     tags: [Items]
 *     responses:
 *       200:
 *         description: A list of found items
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Item'
 *       500:
 *         description: Server error
 */
router.get("/found", (req, res) => {
  req.query.itemType = "found";
  return getAllItems(req, res);
});

/**
 * @swagger
 * /items/user/{userId}:
 *   get:
 *     summary: Get items by user ID
 *     description: Retrieve all items uploaded by a specific user
 *     tags: [Items]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: A list of items uploaded by the user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Item'
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get("/user/:userId", async (req, res) => {
  try {
    // Add specific CORS headers for this route
    res.header('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3002');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Referer');
    
    console.log('Received request for user items:', {
      userId: req.params.userId,
      origin: req.headers.origin,
      referer: req.headers.referer
    });
    
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ success: false, error: "User ID is required" });
    }

    // Set the userId as a query parameter for the getAllItems controller
    req.query.userId = userId;
    return getAllItems(req, res);
  } catch (error) {
    console.error("Error getting user items:", error);
    return res.status(500).json({ 
      success: false, 
      error: "Error fetching user items: " + (error as Error).message 
    });
  }
});

// Add OPTIONS handler for preflight requests to /user/:userId
router.options("/user/:userId", (req, res) => {
  // Set CORS headers for preflight requests
  res.header('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3002');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Referer');
  
  // Respond with a 200 status for preflight requests
  res.status(200).end();
});

/**
 * @swagger
 * /items/{id}:
 *   get:
 *     summary: Get item by ID
 *     description: Retrieve details of a specific item by its ID
 *     tags: [Items]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Item ID
 *     responses:
 *       200:
 *         description: Item details including any matched item
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/Item'
 *                 matchedItem:
 *                   $ref: '#/components/schemas/Item'
 *       404:
 *         description: Item not found
 *       500:
 *         description: Server error
 */
router.get("/:id", getItemById);

/**
 * @swagger
 * /items/{id}/resolve:
 *   put:
 *     summary: Mark an item as resolved
 *     description: Marks a lost or found item as resolved (found or returned)
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Item ID
 *     responses:
 *       200:
 *         description: Item successfully marked as resolved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Item'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not the item owner
 *       404:
 *         description: Item not found
 *       500:
 *         description: Server error
 */
router.put("/:id/resolve", authMiddleware, resolveItem);

/**
 * @swagger
 * /items/{id}:
 *   put:
 *     summary: Update an item
 *     description: Update details of a lost or found item
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               location:
 *                 type: string
 *               category:
 *                 type: string
 *     responses:
 *       200:
 *         description: Item updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Item'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not the item owner
 *       404:
 *         description: Item not found
 *       500:
 *         description: Server error
 */
router.put("/:id", authMiddleware, updateItem);

/**
 * @swagger
 * /items/{id}:
 *   delete:
 *     summary: Delete an item
 *     description: Delete a lost or found item
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Item ID
 *     responses:
 *       200:
 *         description: Item deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not the item owner
 *       404:
 *         description: Item not found
 *       500:
 *         description: Server error
 */
router.delete("/:id", authMiddleware, deleteItem);

export = router; 