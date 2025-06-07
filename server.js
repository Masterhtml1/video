// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', socket => {
  console.log('User connected:', socket.id);

  socket.on('join-room', roomId => {
    socket.join(roomId);
    const clients = io.sockets.adapter.rooms.get(roomId) || new Set();
    const otherClients = [...clients].filter(id => id !== socket.id);

    // Send list of users already in the room to the new user
    socket.emit('all-users', otherClients);

    // Notify others in the room a new user joined
    socket.to(roomId).emit('user-joined', socket.id);

    socket.on('offer', payload => {
      io.to(payload.target).emit('offer', {
        sdp: payload.sdp,
        caller: socket.id,
      });
    });

    socket.on('answer', payload => {
      io.to(payload.target).emit('answer', {
        sdp: payload.sdp,
        responder: socket.id,
      });
    });

    socket.on('ice-candidate', payload => {
      io.to(payload.target).emit('ice-candidate', {
        candidate: payload.candidate,
        from: socket.id,
      });
    });

    // Chat message handler: broadcast to room except sender
    socket.on('chat-message', msg => {
      socket.to(roomId).emit('chat-message', { id: socket.id, message: msg });
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      socket.to(roomId).emit('user-left', socket.id);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
