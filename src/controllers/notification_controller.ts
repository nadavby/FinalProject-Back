/** @format */

import { Request, Response } from 'express';
import NotificationModel, { INotification } from '../models/notification_model';
import { emitNotification } from '../services/socket.service';

// הוספת הודעה חדשה למערכת
export const createNotification = async (
  userId: string,
  type: 'MATCH_FOUND' | 'SYSTEM_NOTIFICATION' | 'MATCH_UPDATED',
  title: string,
  message: string,
  data: any = {}
): Promise<INotification> => {
  try {
    const notification = new NotificationModel({
      userId,
      type,
      title,
      message,
      data,
      isRead: false,
    });

    const savedNotification = await notification.save();
    
    // שליחת ההודעה למשתמש דרך Socket.IO
    emitNotification(userId, {
      type,
      title,
      message,
      data,
      notificationId: savedNotification._id,
    });

    return savedNotification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// קבלת כל ההודעות של משתמש מסוים
export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    const notifications = await NotificationModel.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await NotificationModel.countDocuments({ userId });

    return res.status(200).json({
      success: true,
      data: {
        notifications,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user notifications:', error);
    return res.status(500).json({
      success: false,
      error: 'Error fetching user notifications: ' + (error as Error).message,
    });
  }
};

// סימון הודעה כנקראה
export const markNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;
    const userId = req.body.userId;

    const notification = await NotificationModel.findById(notificationId);

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to update this notification' });
    }

    notification.isRead = true;
    await notification.save();

    return res.status(200).json({ success: true, data: notification });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({
      success: false,
      error: 'Error marking notification as read: ' + (error as Error).message,
    });
  }
};

// סימון כל ההודעות של משתמש כנקראו
export const markAllNotificationsAsRead = async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    await NotificationModel.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return res.status(500).json({
      success: false,
      error: 'Error marking all notifications as read: ' + (error as Error).message,
    });
  }
};

// מחיקת הודעה
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;
    const userId = req.body.userId;

    const notification = await NotificationModel.findById(notificationId);

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this notification' });
    }

    await NotificationModel.findByIdAndDelete(notificationId);

    return res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return res.status(500).json({
      success: false,
      error: 'Error deleting notification: ' + (error as Error).message,
    });
  }
};

// קבלת מספר ההודעות שלא נקראו
export const getUnreadNotificationsCount = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    const count = await NotificationModel.countDocuments({ userId, isRead: false });

    return res.status(200).json({
      success: true,
      data: { count }
    });
  } catch (error) {
    console.error('Error fetching unread notifications count:', error);
    return res.status(500).json({
      success: false,
      error: 'Error fetching unread notifications count: ' + (error as Error).message,
    });
  }
}; 