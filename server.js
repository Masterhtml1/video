// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const roomPasswords = {}; // store passwords by roomId

app.use(express.static('public'));

io.on('connection', socket => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, password }) => {
    // Check or set room password
    if (!roomPasswords[roomId]) {
      roomPasswords[roomId] = password;
      console.log(`Room ${roomId} created with password.`);
    } else if (roomPasswords[roomId] !== password) {
      socket.emit('password-error', 'Incorrect password for room');
      return;
    }

    socket.join(roomId);
    const clients = io.sockets.adapter.rooms.get(roomId) || new Set();
    const otherClients = [...clients].filter(id => id !== socket.id);

    socket.emit('all-users', otherClients);
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
