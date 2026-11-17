const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

app.get('/', (req, res) => res.send('金剛爬塔伺服器運作中 🦍'));

const rooms = {}; // roomCode -> { players: [{id,nick}], messages: [] }

io.on('connection', (socket) => {
  let myRoom = null;
  let myNick = '玩家';

  // 加入房間
  socket.on('join_room', ({ roomCode, nick }) => {
    myRoom = roomCode;
    myNick = nick || '玩家';
    if (!rooms[roomCode]) rooms[roomCode] = { players: [], messages: [] };
    const room = rooms[roomCode];
    socket.join(roomCode);
    // 移除舊的同 id 玩家
    room.players = room.players.filter(p => p.id !== socket.id);
    room.players.push({ id: socket.id, nick: myNick });
    // 廣播房間更新
    io.to(roomCode).emit('room_update', { players: room.players });
    // 傳歷史訊息
    socket.emit('chat_history', room.messages.slice(-40));
    console.log(`${myNick} 加入房間 ${roomCode}，共 ${room.players.length} 人`);
  });

  // 遊戲狀態同步（高頻，只轉發給同房間其他人）
  socket.on('state', (data) => {
    if (!myRoom) return;
    socket.to(myRoom).emit('state', data);
  });

  // 聊天訊息（儲存 + 廣播給同房間所有人）
  socket.on('chat', (data) => {
    if (!myRoom) return;
    const msg = { ...data, id: data.id || ('s' + Date.now() + Math.random()) };
    // 儲存
    rooms[myRoom].messages.push(msg);
    if (rooms[myRoom].messages.length > 100) rooms[myRoom].messages.shift();
    // 廣播給其他人（發送者已本地顯示）
    socket.to(myRoom).emit('chat', msg);
  });

  // 斷線
  socket.on('disconnect', () => {
    if (!myRoom || !rooms[myRoom]) return;
    rooms[myRoom].players = rooms[myRoom].players.filter(p => p.id !== socket.id);
    io.to(myRoom).emit('room_update', { players: rooms[myRoom].players });
    if (rooms[myRoom].players.length === 0) {
      delete rooms[myRoom];
      console.log(`房間 ${myRoom} 已清除`);
    }
    console.log(`${myNick} 離開房間 ${myRoom}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`伺服器啟動於 port ${PORT}`));
