import { Request, Response } from "express";
import notificationModel from "../models/notification_model";

// שליפת כל ההתראות של משתמש
export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }
    const notifications = await notificationModel.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

// סימון התראה כנקראה
export const markNotificationRead = async (req: Request, res: Response) => {
  try {
    const notificationId = req.params.id;
    const notification = await notificationModel.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    res.status(200).json(notification);
  } catch (error) {
    res.status(500).json({ error: "Failed to update notification" });
  }
}; 