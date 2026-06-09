const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingUsers = {};

function findMatch(socket, userData) {
  const { gender, lookingFor, language, country } = userData;
  
  const queues = [
    `${language}_${country}_${lookingFor}`,
    `${language}_any_${lookingFor}`,
    `any_any_${lookingFor}`,
    `${language}_${country}_any`,
    `${language}_any_any`,
    `any_any_any`
  ];

  for (const queue of queues) {
    if (waitingUsers[queue] && waitingUsers[queue].id !== socket.id) {
      const partner = waitingUsers[queue];
      delete waitingUsers[queue];
      
      const room = socket.id + '#' + partner.id;
      socket.join(room);
      partner.join(room);
      socket.currentRoom = room;
      partner.currentRoom = room;

      socket.emit('paired', { room, otherAvatar: partner.userData.avatar, otherGender: partner.userData.gender, isInitiator: true });
      partner.emit('paired', { room, otherAvatar: socket.userData.avatar, otherGender: socket.userData.gender, isInitiator: false });
      return;
    }
  }

  const myQueue = `${language}_${country}_${lookingFor}`;
  waitingUsers[myQueue] = socket;
  socket.emit('waiting');
}

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    socket.userData = data;
    findMatch(socket, data);
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
    findMatch(socket, socket.userData);
  });

  socket.on('game-event', (data) => {
    socket.to(data.room).emit('game-event', data);
  });

  socket.on('rps-choice', (data) => {
    if (!socket.rpsChoice) {
      socket.rpsChoice = data.choice;
      socket.to(data.room).emit('rps-waiting');
    } else {
      const room = data.room;
      const sockets = io.sockets.adapter.rooms.get(room);
      sockets.forEach(id => {
        const s = io.sockets.sockets.get(id);
        if (s && s.id !== socket.id) {
          const result = getRPSResult(socket.rpsChoice, data.choice);
          io.to(room).emit('game-event', { type: 'rps-result', result });
          socket.rpsChoice = null;
          s.rpsChoice = null;
        }
      });
    }
  });

  socket.on('request-18', (data) => {
    socket.to(data.room).emit('request-18');
  });

  socket.on('disconnect', () => {
    Object.keys(waitingUsers).forEach(key => {
      if (waitingUsers[key] === socket) delete waitingUsers[key];
    });
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('partner-left');
    }
  });
});

function getRPSResult(a, b) {
  if (a === b) return `Remis! Oboje wybrali ${a}`;
  if ((a.includes('Kamień') && b.includes('Nożyce')) ||
      (a.includes('Nożyce') && b.includes('Papier')) ||
      (a.includes('Papier') && b.includes('Kamień'))) {
    return `Gracz 1: ${a} vs Gracz 2: ${b} — Gracz 1 wygrywa! 🏆`;
  }
  return `Gracz 1: ${a} vs Gracz 2: ${b} — Gracz 2 wygrywa! 🏆`;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Serwer działa na porcie ' + PORT);
});