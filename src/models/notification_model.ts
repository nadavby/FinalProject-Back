/** @format */

import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  userId: string;
  type: 'MATCH_FOUND' | 'SYSTEM_NOTIFICATION' | 'MATCH_UPDATED';
  title: string;
  message: string;
  data: any;
  isRead: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['MATCH_FOUND', 'SYSTEM_NOTIFICATION', 'MATCH_UPDATED'],
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model<INotification>('Notification', notificationSchema); 