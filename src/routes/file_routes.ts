/** @format */

import express from "express";
const router = express.Router();
import multer from "multer";

/**
 * @swagger
 * tags:
 *   name: Files
 *   description: File upload API
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     FileResponse:
 *       type: object
 *       properties:
 *         url:
 *           type: string
 *           description: The URL of the uploaded file
 *       example:
 *         url: http://example.com/public/users/1648372893654.jpg
 */

const base = process.env.DOMAIN_BASE + "/";
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/users");
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
const upload = multer({ storage: storage });

/**
 * @swagger
 * /file:
 *   post:
 *     summary: Upload a file
 *     description: Upload a single file to the server
 *     tags:
 *       - Files
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file to upload
 *             required:
 *               - file
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FileResponse'
 *       400:
 *         description: Bad request, invalid file or missing file
 *       500:
 *         description: Server error
 */
router.post("/", upload.single("file"), function (req, res) {
  console.log("router.post(/file: " + base + req.file?.path);
  res.status(200).send({ url: base + req.file?.path });
});

export = router;