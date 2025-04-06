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
    console.log('Client connected:', socket.id);

    socket.on('authenticate', (data) => {
      console.log('User authenticated:', data);
      if (data && data.userId) {
        socket.join(data.userId); // Join a room specific to this user
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
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

export const emitNotification = (userId: string, notification: any) => {
  try {
    const io = getIO();
    if (!io) {
      console.error('Socket.IO not initialized');
      return;
    }
    
    // Determine which event to emit based on notification type
    const eventName = notification.type === 'MATCH_FOUND' 
      ? 'match_notification' 
      : 'system_notification';
    
    io.to(userId).emit(eventName, notification);
    console.log('Notification emitted to user:', userId);
  } catch (error) {
    console.error('Error emitting notification:', error);
  }
}; 