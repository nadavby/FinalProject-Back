import mongoose from "mongoose";

export interface INotification {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  isRead?: boolean;
  createdAt?: Date;
}

const notificationSchema = new mongoose.Schema<INotification>({
  userId: { type: String, required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const notificationModel = mongoose.model<INotification>("notifications", notificationSchema);

export default notificationModel; 