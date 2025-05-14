/** @format */

import express, { Express } from "express";
const app = express();
import dotenv from "dotenv";
dotenv.config();
import bodyParser from "body-parser";
import mongoose from "mongoose";
import authRoutes from "./routes/auth_routes";
import swaggerJsDoc from "swagger-jsdoc";
import swaggerUI from "swagger-ui-express";
import fileRoutes from "./routes/file_routes";
import itemRoutes from "./routes/item_routes";
import imageComparisonRoutes from "./routes/image_comparison_routes";
import cors from "cors";

const corsOptions = {
  origin: ['http://localhost:3002', 'http://localhost:5173'].concat(
    process.env.DOMAIN_BASE ? [process.env.DOMAIN_BASE] : []
  ),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Referer'],
  credentials: true,
  maxAge: 86400 
};

app.use(cors(corsOptions));

app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || corsOptions.origin[0]);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', corsOptions.methods.join(', '));
  res.header('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  res.header('Access-Control-Max-Age', String(corsOptions.maxAge));
  res.status(200).end();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/auth", authRoutes);
app.use("/file", fileRoutes);
app.use("/items", itemRoutes);
app.use("/api/image-comparison", imageComparisonRoutes);
app.use("/public", express.static("public"));

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TripBuddy Lost & Found API",
      version: "1.0.0",
      description: "REST server for lost and found items with image recognition",
    },
    servers: [
      { url: process.env.DOMAIN_BASE },
      { url: "https://10.10.246.118" },
      { url: "http://10.10.246.118" },
    ],
  },
  apis: ["./src/routes/*.ts"],
};
const specs = swaggerJsDoc(options);
app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(specs));

const initApp = () => {
  return new Promise<Express>((resolve, reject) => {
    const db = mongoose.connection;
    db.on("error", (error) => console.error(error));
    db.once("open", () => console.log("Connected to Database"));
    if (process.env.DB_CONNECTION === undefined) {
      console.log("Please add a valid DB_CONNECTION to your .env file");
      reject();
    } else {
      mongoose.connect(process.env.DB_CONNECTION).then(() => {
        console.log("initApp Finished");
        resolve(app);
      });
    }
  });
};

export default initApp;
