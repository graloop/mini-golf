/**
 * Mini-Golf 2D Multiplayer Server
 * Node.js HTTP + WebSocket server with ultra-low memory footprint and password protection.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./roomManager');

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || "";

const roomManager = new RoomManager();

// Simple MIME types for static file serving
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Parse URL
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, '../public', filePath);

  const extname = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1><p>The requested mini-golf resource was not found.</p>');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let authenticated = APP_PASSWORD === "";
  let currentRoomId = null;
  let currentPlayerId = null;

  ws.send(JSON.stringify({
    type: "CONNECTION_ACK",
    requiresPassword: APP_PASSWORD !== ""
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Handle Authentication
      if (data.type === "AUTH") {
        if (APP_PASSWORD === "" || data.password === APP_PASSWORD) {
          authenticated = true;
          ws.send(JSON.stringify({ type: "AUTH_SUCCESS" }));
        } else {
          ws.send(JSON.stringify({ type: "AUTH_ERROR", message: "Incorrect password" }));
        }
        return;
      }

      if (!authenticated) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Unauthorized. Please authenticate first." }));
        return;
      }

      // Handle Room Actions
      switch (data.type) {
        case "CREATE_ROOM": {
          const { room, player } = roomManager.createRoom(data.playerName, ws);
          currentRoomId = room.id;
          currentPlayerId = player.id;
          ws.send(JSON.stringify({
            type: "ROOM_JOINED",
            roomId: room.id,
            playerId: player.id,
            isHost: true,
            players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, isHost: p.isHost }))
          }));
          break;
        }

        case "JOIN_ROOM": {
          const result = roomManager.joinRoom(data.roomId.toUpperCase(), data.playerName, ws);
          if (result.error) {
            ws.send(JSON.stringify({ type: "ERROR", message: result.error }));
          } else {
            const { room, player } = result;
            currentRoomId = room.id;
            currentPlayerId = player.id;

            // Notify joining player
            ws.send(JSON.stringify({
              type: "ROOM_JOINED",
              roomId: room.id,
              playerId: player.id,
              isHost: player.isHost,
              players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, isHost: p.isHost }))
            }));

            // Broadcast to room
            room.broadcast({
              type: "PLAYER_JOINED",
              players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, isHost: p.isHost }))
            });
          }
          break;
        }

        case "START_GAME": {
          const result = roomManager.startGame(data.roomId, currentPlayerId, data.parcourId);
          if (result.error) {
            ws.send(JSON.stringify({ type: "ERROR", message: result.error }));
          } else {
            const room = result.room;
            room.broadcast({
              type: "GAME_STARTED",
              courseIndex: room.currentCourseIndex,
              course: room.currentCourse,
              players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                score: p.score,
                strokes: p.strokes,
                ball: p.ball
              })),
              activePlayerId: room.players[room.activePlayerIndex].id
            });
          }
          break;
        }

        case "SHOOT": {
          const result = roomManager.shootBall(currentRoomId, currentPlayerId, data.angle, data.power);
          if (result.error) {
            ws.send(JSON.stringify({ type: "ERROR", message: result.error }));
          }
          break;
        }

        case "SKIP_HOLE": {
          const result = roomManager.skipHole(data.roomId, currentPlayerId);
          if (result.error) {
            ws.send(JSON.stringify({ type: "ERROR", message: result.error }));
          }
          break;
        }

        default:
          ws.send(JSON.stringify({ type: "ERROR", message: "Unknown message type" }));
          break;
      }
    } catch (e) {
      console.error("WebSocket message error:", e);
      ws.send(JSON.stringify({ type: "ERROR", message: "Invalid message payload" }));
    }
  });

  ws.on('close', () => {
    roomManager.removePlayer(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Mini-Golf 2D server running on port ${PORT}`);
  console.log(`Password protection: ${APP_PASSWORD ? 'ENABLED' : 'DISABLED'}`);
});
