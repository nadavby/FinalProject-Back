import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

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
      }
    });

    socket.on('disconnect', () => {
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

