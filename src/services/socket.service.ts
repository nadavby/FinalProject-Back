import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createNotification } from '../controllers/notification_controller';

let io: Server;

export const initSocket = (server: HttpServer) => {
  const origins = ['http://localhost:3002', 'http://localhost:5173'];
  if (process.env.DOMAIN_BASE) {
    origins.push(process.env.DOMAIN_BASE);
  }

  io = new Server(server, {
    cors: {
      origin: origins,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Referer'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {

    socket.on('authenticate', (data) => {
      if (data && data.userId) {
        socket.join(data.userId); 
        console.log(`User ${data.userId} authenticated and joined room`);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected');
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

// Track recently sent notifications to prevent duplicates
const recentNotifications = new Map<string, Set<string>>();
const NOTIFICATION_COOLDOWN = 5000; // 5 seconds cooldown

// Clean up old notifications periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of recentNotifications.entries()) {
    // Remove notifications older than the cooldown period
    timestamps.forEach(timestamp => {
      if (now - parseInt(timestamp) > NOTIFICATION_COOLDOWN) {
        timestamps.delete(timestamp);
      }
    });
    // Remove user entry if no recent notifications
    if (timestamps.size === 0) {
      recentNotifications.delete(userId);
    }
  }
}, NOTIFICATION_COOLDOWN);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const emitNotification = async (userId: string, notification: any) => {
  try {
    const io = getIO();
    if (!io) {
      console.error('Socket.IO not initialized');
      return;
    }

    // Create unique key for this notification
    const notificationKey = `${notification.type}_${notification.data?.matchedItemId || ''}_${Date.now()}`;
    
    // Check if we've recently sent a similar notification
    const userNotifications = recentNotifications.get(userId) || new Set();
    if (userNotifications.size > 0) {
      // Don't send duplicate notifications within cooldown period
      return;
    }

    // Track this notification
    userNotifications.add(notificationKey);
    recentNotifications.set(userId, userNotifications);
    
    const eventName = notification.type === 'MATCH_FOUND' 
      ? 'match_notification' 
      : 'system_notification';
    
    // Send real-time notification through Socket.IO
    io.to(userId).emit(eventName, notification);
    console.log('Real-time notification emitted to user:', userId);
    
    // Save notification to database for persistence
    try {
      await createNotification(
        userId,
        notification.type,
        notification.title || 'System Notification', 
        notification.message || 'You have a new notification',
        notification.data || {}
      );
      console.log('Notification saved to database for user:', userId);
    } catch (dbError) {
      console.error('Error saving notification to database:', dbError);
    }
  } catch (error) {
    console.error('Error emitting notification:', error);
  }
}; 