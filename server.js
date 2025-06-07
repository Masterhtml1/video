const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const roomPasswords = {}; // { roomId: password }
const roomsUsers = {};    // { roomId: Set of socketIds }

app.use(express.static('public'));

// Normal users namespace
io.on('connection', socket => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, password }) => {
    // Admin bypass password with special password "admin_secret"
    if (!roomPasswords[roomId] && password !== 'admin_secret') {
      roomPasswords[roomId] = password;
      console.log(`Room ${roomId} created with password.`);
    } else if (password !== 'admin_secret' && roomPasswords[roomId] !== password) {
      socket.emit('password-error', 'Incorrect password for room');
      return;
    }

    socket.join(roomId);

    if (!roomsUsers[roomId]) roomsUsers[roomId] = new Set();
    roomsUsers[roomId].add(socket.id);

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

      if (roomsUsers[roomId]) {
        roomsUsers[roomId].delete(socket.id);
        if (roomsUsers[roomId].size === 0) {
          delete roomsUsers[roomId];
          delete roomPasswords[roomId];
          console.log(`Room ${roomId} deleted as empty`);
        }
      }
    });
  });
});

// Admin namespace
const adminNamespace = io.of('/admin');

adminNamespace.on('connection', socket => {
  console.log('Admin connected:', socket.id);

  // Send current rooms and users list on connect
  function emitRoomsUpdate() {
    // Format rooms info with array of user IDs
    const roomsInfo = {};
    for (const [roomId, usersSet] of Object.entries(roomsUsers)) {
      roomsInfo[roomId] = Array.from(usersSet);
    }
    socket.emit('rooms-update', roomsInfo);
  }

  emitRoomsUpdate();

  // Keep admin updated when rooms/users change
  const interval = setInterval(emitRoomsUpdate, 3000);

  // Admin can join any room with special password "admin_secret"
  socket.on('join-room', roomId => {
    socket.join(roomId);
  });

  socket.on('disconnect', () => {
    clearInterval(interval);
    console.log('Admin disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
