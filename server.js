const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

app.get('/', (req, res) => res.send('金剛爬塔伺服器運作中 🦍'));

// rooms[roomCode] = { players: [{id, nick, score, lives, level, x, y, state}], messages: [] }
const rooms = {};

io.on('connection', (socket) => {
  let myRoom = null;
  let myNick = '玩家';

  // 建立或加入房間
  socket.on('join_room', ({ roomCode, nick }) => {
    myRoom = roomCode;
    myNick = nick || '玩家';

    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: [], messages: [] };
    }
    const room = rooms[roomCode];

    // 加入 socket room
    socket.join(roomCode);

    // 記錄玩家
    room.players = room.players.filter(p => p.id !== socket.id);
    room.players.push({ id: socket.id, nick: myNick, score: 0, lives: 3, level: 1, x: 0, y: 0, state: 'waiting' });

    // 通知房間所有人
    io.to(roomCode).emit('room_update', {
      players: room.players,
      you: socket.id
    });

    // 傳送歷史訊息給新加入者
    socket.emit('chat_history', room.messages.slice(-40));

    // 廣播有人加入
    socket.to(roomCode).emit('chat_msg', {
      type: 'system',
      text: `🎮 ${myNick} 加入了房間！`,
      ts: Date.now()
    });

    console.log(`${myNick} 加入房間 ${roomCode}，目前 ${room.players.length} 人`);
  });

  // 玩家位置/狀態即時同步（高頻）
  socket.on('pos', (data) => {
    if (!myRoom) return;
    // 廣播給同房間其他人
    socket.to(myRoom).emit('opp_pos', { ...data, id: socket.id, nick: myNick });
    // 更新房間記錄
    if (rooms[myRoom]) {
      const p = rooms[myRoom].players.find(p => p.id === socket.id);
      if (p) Object.assign(p, data);
    }
  });

  // 分數/狀態更新
  socket.on('score_update', (data) => {
    if (!myRoom) return;
    socket.to(myRoom).emit('opp_score', { ...data, id: socket.id, nick: myNick });
    if (rooms[myRoom]) {
      const p = rooms[myRoom].players.find(p => p.id === socket.id);
      if (p) Object.assign(p, data);
    }
  });

  // 聊天
  socket.on('chat_msg', (data) => {
    if (!myRoom) return;
    const msg = { ...data, nick: myNick, id: socket.id, ts: Date.now() };
    rooms[myRoom].messages.push(msg);
    if (rooms[myRoom].messages.length > 100) rooms[myRoom].messages.shift();
    io.to(myRoom).emit('chat_msg', msg); // 廣播給所有人包含自己
  });

  // 遊戲事件（過關、死亡、換人）
  socket.on('game_event', (data) => {
    if (!myRoom) return;
    io.to(myRoom).emit('game_event', { ...data, id: socket.id, nick: myNick });
  });

  // 斷線
  socket.on('disconnect', () => {
    if (!myRoom || !rooms[myRoom]) return;
    rooms[myRoom].players = rooms[myRoom].players.filter(p => p.id !== socket.id);
    io.to(myRoom).emit('room_update', { players: rooms[myRoom].players, you: null });
    io.to(myRoom).emit('chat_msg', {
      type: 'system',
      text: `👋 ${myNick} 離開了`,
      ts: Date.now()
    });
    if (rooms[myRoom].players.length === 0) delete rooms[myRoom];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`伺服器啟動於 port ${PORT}`));
