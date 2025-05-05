/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from "mongoose";

export interface IItem {
  _id?: string;
  userId: string;
  imageUrl: string;
  itemType: 'lost' | 'found';
  description?: string;
  location?: {
    lat: number;
    lng: number;
  } | string;
  category?: string;
  timestamp?: Date;
  ownerName?: string;
  ownerEmail?: string;
  visionApiData?: {
    labels?: string[];
    objects?: Array<{
      name: string;
      score: number;
      boundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
      }
    }>;
    colors?: Array<{
      color: string;
      score: number;
    }>;
    imageProperties?: any;
  };
  matchedItemId?: string;
  isResolved?: boolean;
}

const itemSchema = new mongoose.Schema<IItem>(
  {
    userId: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    itemType: {
      type: String,
      enum: ['lost', 'found'],
      required: true,
    },
    description: {
      type: String,
    },
    location: {
      type: mongoose.Schema.Types.Mixed,
    },
    category: {
      type: String,
    },
    ownerName: {
      type: String,
    },
    ownerEmail: {
      type: String,
    },
    visionApiData: {
      labels: [String],
      objects: [{
        name: String,
        score: Number,
        boundingBox: {
          x: Number,
          y: Number,
          width: Number,
          height: Number,
        }
      }],
      colors: [{
        color: String,
        score: Number,
      }],
      imageProperties: mongoose.Schema.Types.Mixed,
    },
    matchedItemId: {
      type: String,
    },
    isResolved: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const itemModel = mongoose.model<IItem>("items", itemSchema);

export default itemModel; 