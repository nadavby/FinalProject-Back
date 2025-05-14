/** @format */

import express from 'express';
import { verifyToken } from '../utils/auth_middleware';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getUnreadNotificationsCount
} from '../controllers/notification_controller';

const router = express.Router();

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: קבלת כל ההודעות של המשתמש המחובר
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: מספר העמוד לתצוגה
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: כמות התוצאות בכל עמוד
 *     responses:
 *       200:
 *         description: רשימת ההודעות של המשתמש
 *       401:
 *         description: משתמש לא מאומת
 *       500:
 *         description: שגיאת שרת
 */
router.get('/', verifyToken, getUserNotifications);

/**
 * @swagger
 * /api/notifications/unread/count:
 *   get:
 *     summary: קבלת מספר ההודעות שלא נקראו
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: מספר ההודעות שלא נקראו
 *       401:
 *         description: משתמש לא מאומת
 *       500:
 *         description: שגיאת שרת
 */
router.get('/unread/count', verifyToken, getUnreadNotificationsCount);

/**
 * @swagger
 * /api/notifications/{notificationId}/read:
 *   put:
 *     summary: סימון הודעה כנקראה
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         schema:
 *           type: string
 *         required: true
 *         description: המזהה של ההודעה
 *     responses:
 *       200:
 *         description: ההודעה סומנה כנקראה בהצלחה
 *       401:
 *         description: משתמש לא מאומת
 *       403:
 *         description: אין הרשאה לעדכן את ההודעה
 *       404:
 *         description: ההודעה לא נמצאה
 *       500:
 *         description: שגיאת שרת
 */
router.put('/:notificationId/read', verifyToken, markNotificationAsRead);

/**
 * @swagger
 * /api/notifications/mark-all-read:
 *   put:
 *     summary: סימון כל ההודעות כנקראו
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: כל ההודעות סומנו כנקראו בהצלחה
 *       401:
 *         description: משתמש לא מאומת
 *       500:
 *         description: שגיאת שרת
 */
router.put('/mark-all-read', verifyToken, markAllNotificationsAsRead);

/**
 * @swagger
 * /api/notifications/{notificationId}:
 *   delete:
 *     summary: מחיקת הודעה
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         schema:
 *           type: string
 *         required: true
 *         description: המזהה של ההודעה
 *     responses:
 *       200:
 *         description: ההודעה נמחקה בהצלחה
 *       401:
 *         description: משתמש לא מאומת
 *       403:
 *         description: אין הרשאה למחוק את ההודעה
 *       404:
 *         description: ההודעה לא נמצאה
 *       500:
 *         description: שגיאת שרת
 */
router.delete('/:notificationId', verifyToken, deleteNotification);

export default router; 