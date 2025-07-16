const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// Store connected users
const connectedUsers = new Map();
const userStatus = new Map(); // Track online/offline status

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);

  // Handle user joining
  socket.on('join', (username) => {
    try {
      // Check if username is already taken
      const existingUser = Array.from(connectedUsers.values()).find(user => user.username === username);
      if (existingUser) {
        socket.emit('error', { message: 'Username already taken' });
        return;
      }

      // Store user information
      connectedUsers.set(socket.id, {
        id: socket.id,
        username: username,
        joinedAt: new Date()
      });

      // Join the user to the main room
      socket.join('main');

      // Notify user they've joined successfully
      socket.emit('joined', { username });

      // Broadcast to all clients that a new user joined
      socket.broadcast.emit('userJoined', {
        username,
        timestamp: new Date()
      });

      // Send updated users list to all clients
      updateUsersList();

      console.log(`User ${username} joined with ID: ${socket.id}`);
    } catch (error) {
      console.error('Error handling user join:', error);
      socket.emit('error', { message: 'Failed to join chat' });
    }
  });

  // Helper function to update users list
  function updateUsersList() {
    const usersList = Array.from(connectedUsers.values()).map(user => ({
      id: user.id,
      username: user.username,
      status: 'online'
    }));
    io.emit('usersUpdate', usersList);
  }

  // Handle private messages
  socket.on('privateMessage', (data) => {
    try {
      const sender = connectedUsers.get(socket.id);
      if (!sender) {
        socket.emit('error', { message: 'Sender not found' });
        return;
      }

      // Find recipient by username
      const recipient = Array.from(connectedUsers.values()).find(user => user.username === data.to);
      if (!recipient) {
        socket.emit('error', { message: 'Recipient not found' });
        return;
      }

      const messageData = {
        id: Date.now().toString(),
        username: sender.username,
        message: data.message,
        timestamp: new Date(),
        type: 'private',
        to: data.to,
        from: sender.username
      };

      // Send to recipient
      io.to(recipient.id).emit('privateMessage', messageData);
      
      // Send back to sender for confirmation
      socket.emit('privateMessage', messageData);

      console.log(`Private message from ${sender.username} to ${data.to}: ${data.message}`);
    } catch (error) {
      console.error('Error handling private message:', error);
      socket.emit('error', { message: 'Failed to send private message' });
    }
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      // Send typing indicator to specific recipient if specified
      if (data.to) {
        const recipient = Array.from(connectedUsers.values()).find(u => u.username === data.to);
        if (recipient) {
          io.to(recipient.id).emit('userTyping', {
            username: user.username,
            isTyping: data.isTyping,
            from: user.username
          });
        }
      } else {
        // Fallback to broadcast (though we're focusing on private chat)
        socket.broadcast.emit('userTyping', {
          username: user.username,
          isTyping: data.isTyping
        });
      }
    }
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    try {
      const user = connectedUsers.get(socket.id);
      if (user) {
        // Remove user from connected users
        connectedUsers.delete(socket.id);

        // Update users list (no broadcast of leave message)
        const usersList = Array.from(connectedUsers.values()).map(user => ({
          id: user.id,
          username: user.username,
          status: 'online'
        }));
        io.emit('usersUpdate', usersList);

        console.log(`User ${user.username} disconnected`);
      }
    } catch (error) {
      console.error('Error handling user disconnect:', error);
    }
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Error handling for server
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Start server
server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
  console.log(`Access the chat at: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});