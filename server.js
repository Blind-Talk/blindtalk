const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingUser = null;

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    socket.userData = data;
    if (waitingUser) {
      const room = socket.id + '#' + waitingUser.id;
      socket.join(room);
      waitingUser.join(room);
      socket.currentRoom = room;
      waitingUser.currentRoom = room;
      socket.emit('paired', { room, otherAvatar: waitingUser.userData.avatar });
      waitingUser.emit('paired', { room, otherAvatar: data.avatar });
      waitingUser = null;
    } else {
      waitingUser = socket;
      socket.emit('waiting');
    }
  });

  socket.on('message', (data) => {
    socket.to(data.room).emit('message', { text: data.text, avatar: data.avatar });
  });

  socket.on('reveal-request', (data) => {
    socket.to(data.room).emit('reveal-request');
  });

  socket.on('both-revealed', (data) => {
    const room = data.room;
    const sockets = io.sockets.adapter.rooms.get(room);
    sockets.forEach(id => {
      const s = io.sockets.sockets.get(id);
      if (s && s.id !== socket.id) {
        s.emit('both-revealed', { otherName: data.name, otherAvatar: data.avatar });
        socket.emit('both-revealed', { otherName: s.userData?.name, otherAvatar: s.userData?.avatar });
      }
    });
  });

  socket.on('next', (data) => {
    socket.to(data.room).emit('partner-left');
    socket.leave(data.room);
    socket.currentRoom = null;
    if (waitingUser) {
      const room = socket.id + '#' + waitingUser.id;
      socket.join(room);
      waitingUser.join(room);
      socket.currentRoom = room;
      waitingUser.currentRoom = room;
      socket.emit('paired', { room, otherAvatar: waitingUser.userData.avatar });
      waitingUser.emit('paired', { room, otherAvatar: socket.userData.avatar });
      waitingUser = null;
    } else {
      waitingUser = socket;
      socket.emit('waiting');
    }
  });

  socket.on('disconnect', () => {
    if (waitingUser === socket) waitingUser = null;
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('partner-left');
    }
  });
});

server.listen(3000, () => {
  console.log('Serwer działa na http://localhost:3000');
});