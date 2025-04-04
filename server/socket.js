const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Message = require('./models/Message');

const onlineUsers = new Map();
const userSockets = new Map();

function initializeSocket(server) {
  const io = socketIo(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"]
    }
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.user.name);
    
    // Add user to online users
    onlineUsers.set(socket.user._id.toString(), socket.user);
    userSockets.set(socket.user._id.toString(), socket);
    
    // Join room
    socket.on('joinRoom', async (roomId) => {
      socket.join(roomId);
      console.log(`${socket.user.name} joined room: ${roomId}`);
      
      // Load previous messages
      try {
        const messages = await Message.find({ room: roomId })
          .sort({ timestamp: -1 })
          .limit(50)
          .populate('author', 'name avatar');
        
        socket.emit('previousMessages', messages.reverse());
      } catch (error) {
        console.error('Error loading messages:', error);
      }
      
      // Broadcast updated online users list
      io.to(roomId).emit('updateOnlineUsers', Array.from(onlineUsers.values()));
    });

    // Leave room
    socket.on('leaveRoom', (roomId) => {
      socket.leave(roomId);
      console.log(`${socket.user.name} left room: ${roomId}`);
    });

    // Handle messages
    socket.on('sendMessage', async (messageData) => {
      try {
        const message = new Message({
          content: messageData.content,
          author: socket.user._id,
          room: messageData.room,
          timestamp: new Date()
        });

        await message.save();
        
        const populatedMessage = await Message.findById(message._id)
          .populate('author', 'name avatar');

        io.to(messageData.room).emit('message', populatedMessage);
      } catch (error) {
        console.error('Error saving message:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.user.name);
      onlineUsers.delete(socket.user._id.toString());
      userSockets.delete(socket.user._id.toString());
      
      // Broadcast updated online users list to all rooms
      io.emit('updateOnlineUsers', Array.from(onlineUsers.values()));
    });
  });

  return io;
}

module.exports = initializeSocket; 