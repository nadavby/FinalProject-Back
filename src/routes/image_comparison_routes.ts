import express from 'express';
import { compareImages, findMatches, analyzeImage } from '../controllers/image_comparison_controller';
import { authMiddleware } from '../controllers/auth_controller';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Image Comparison
 *   description: AI-based image comparison API
 */

/**
 * @swagger
 * /api/image-comparison/compare:
 *   post:
 *     summary: Compare two images
 *     description: Compare two images to determine if they contain the same object
 *     tags: [Image Comparison]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image1Url
 *               - image2Url
 *             properties:
 *               image1Url:
 *                 type: string
 *                 description: URL of the first image
 *               image2Url:
 *                 type: string
 *                 description: URL of the second image
 *     responses:
 *       200:
 *         description: Comparison result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isMatch:
 *                   type: boolean
 *                   description: Whether the images match
 *                 score:
 *                   type: number
 *                   description: Similarity score (0-100)
 *                 matchedObjects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       objectName:
 *                         type: string
 *                       similarityScore:
 *                         type: number
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/compare', authMiddleware, compareImages);

/**
 * @swagger
 * /api/image-comparison/analyze:
 *   post:
 *     summary: Analyze an image
 *     description: Analyze an image using Google Cloud Vision API
 *     tags: [Image Comparison]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - imageUrl
 *             properties:
 *               imageUrl:
 *                 type: string
 *                 description: URL of the image to analyze
 *     responses:
 *       200:
 *         description: Analysis result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 labels:
 *                   type: array
 *                   items:
 *                     type: string
 *                 objects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       score:
 *                         type: number
 *                       boundingBox:
 *                         type: object
 *                         properties:
 *                           x:
 *                             type: number
 *                           y:
 *                             type: number
 *                           width:
 *                             type: number
 *                           height:
 *                             type: number
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/analyze', authMiddleware, analyzeImage);

/**
 * @swagger
 * /api/image-comparison/find-matches/{itemId}:
 *   get:
 *     summary: Find matches for an item
 *     description: Find potential matches for a specific item
 *     tags: [Image Comparison]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Item ID
 *     responses:
 *       200:
 *         description: List of potential matches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 item:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     category:
 *                       type: string
 *                     location:
 *                       type: string
 *                     date:
 *                       type: string
 *                       format: date-time
 *                     itemType:
 *                       type: string
 *                       enum: [lost, found]
 *                     imgURL:
 *                       type: string
 *                 matches:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       item:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                           category:
 *                             type: string
 *                           location:
 *                             type: string
 *                           date:
 *                             type: string
 *                             format: date-time
 *                           itemType:
 *                             type: string
 *                             enum: [lost, found]
 *                           imgURL:
 *                             type: string
 *                           ownerName:
 *                             type: string
 *                           ownerEmail:
 *                             type: string
 *                       score:
 *                         type: number
 *                         description: Similarity score (0-100)
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Item not found
 *       500:
 *         description: Server error
 */
router.get('/find-matches/:itemId', authMiddleware, findMatches);

export = router; 