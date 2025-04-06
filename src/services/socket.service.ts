import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: Server;

export const initSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: ["http://localhost:3002", "http://localhost:5173"],  // Allow both origins
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('authenticate', (userId: string) => {
      console.log('User authenticated:', userId);
      socket.join(userId); // Join a room specific to this user
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
    const socketIO = getIO();
    socketIO.to(userId).emit('notification', notification);
    console.log('Notification emitted to user:', userId);
  } catch (error) {
    console.error('Error emitting notification:', error);
  }
}; 