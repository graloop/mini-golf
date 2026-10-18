/**
 * Mini-Golf 2D Multiplayer Server
 * Node.js HTTP + WebSocket server with password protection.
 * Designed to run behind an nginx reverse proxy that terminates TLS.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { RoomManager, publicPlayer } = require('./roomManager');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const APP_PASSWORD = process.env.APP_PASSWORD;
// Only trust X-Real-IP when the app is reachable exclusively through nginx.
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
// Comma-separated list of origins allowed to open a WebSocket, e.g. https://golf.graloop.com
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS || 200);
const MAX_CONNECTIONS_PER_IP = Number(process.env.MAX_CONNECTIONS_PER_IP || 10);
const AUTH_TIMEOUT_MS = 30 * 1000;
const MAX_AUTH_FAILURES = 5; // per connection
const IP_MAX_AUTH_FAILURES = 10; // per IP within the lockout window
const IP_LOCKOUT_MS = 15 * 60 * 1000;
const MESSAGES_PER_SECOND = 20;
const HEARTBEAT_MS = 30 * 1000;

if (!APP_PASSWORD || APP_PASSWORD.length < 16) {
  console.error('APP_PASSWORD must be set to a secret at least 16 characters long.');
  process.exit(1);
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}

if (ALLOWED_ORIGINS.length === 0) {
  console.warn('ALLOWED_ORIGINS is not set: WebSocket connections from any origin will be accepted.');
}

const PASSWORD_HASH = crypto.createHash('sha256').update(APP_PASSWORD).digest();

function passwordMatches(candidate) {
  if (typeof candidate !== 'string' || candidate.length > 256) return false;
  const hash = crypto.createHash('sha256').update(candidate).digest();
  return crypto.timingSafeEqual(hash, PASSWORD_HASH);
}

const roomManager = new RoomManager();
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const STATIC_FILES = new Map([
  ['/', { filename: 'index.html', contentType: 'text/html; charset=utf-8' }],
  ['/style.css', { filename: 'style.css', contentType: 'text/css; charset=utf-8' }],
  ['/client.js', { filename: 'client.js', contentType: 'text/javascript; charset=utf-8' }]
]);
const CONNECT_SRC = ["'self'", ...ALLOWED_ORIGINS.map(o => o.replace(/^http/, 'ws'))].join(' ');
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src ${CONNECT_SRC}`
};

function getClientIp(req) {
  if (TRUST_PROXY) {
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.length > 0 && realIp.length <= 64) return realIp;
  }
  return req.socket.remoteAddress || 'unknown';
}

function sendHttpResponse(req, res, status, headers, body = '') {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendHttpResponse(req, res, 405, { Allow: 'GET, HEAD', 'Content-Length': '0' });
    return;
  }

  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    sendHttpResponse(req, res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad request');
    return;
  }

  if (pathname === '/healthz') {
    sendHttpResponse(req, res, 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, 'ok');
    return;
  }

  const staticFile = STATIC_FILES.get(pathname);
  if (!staticFile) {
    sendHttpResponse(req, res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found');
    return;
  }

  const filePath = path.join(PUBLIC_DIR, staticFile.filename);
  fs.readFile(filePath, (err, content) => {
    if (err) {
      console.error(`Failed to read public asset ${staticFile.filename}:`, err);
      sendHttpResponse(req, res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Internal server error');
      return;
    }

    sendHttpResponse(req, res, 200, {
      'Content-Type': staticFile.contentType,
      'Cache-Control': 'no-store',
      'Content-Length': String(content.length)
    }, content);
  });
});

// Slowloris / idle-socket protection
server.headersTimeout = 10 * 1000;
server.requestTimeout = 15 * 1000;
server.maxHeadersCount = 50;

// ================= CONNECTION & BRUTE-FORCE TRACKING =================
const connectionsPerIp = new Map(); // ip -> count
const authFailuresPerIp = new Map(); // ip -> { count, firstAt, lockedUntil }

function isIpLocked(ip) {
  const entry = authFailuresPerIp.get(ip);
  return Boolean(entry && entry.lockedUntil > Date.now());
}

function recordAuthFailure(ip) {
  const now = Date.now();
  let entry = authFailuresPerIp.get(ip);
  if (!entry || now - entry.firstAt > IP_LOCKOUT_MS) {
    entry = { count: 0, firstAt: now, lockedUntil: 0 };
    authFailuresPerIp.set(ip, entry);
  }
  entry.count += 1;
  if (entry.count >= IP_MAX_AUTH_FAILURES) {
    entry.lockedUntil = now + IP_LOCKOUT_MS;
    console.warn(`Locking out ${ip} for ${IP_LOCKOUT_MS / 60000} minutes after repeated failed logins`);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of authFailuresPerIp) {
    if (entry.lockedUntil < now && now - entry.firstAt > IP_LOCKOUT_MS) authFailuresPerIp.delete(ip);
  }
}, 60 * 1000).unref();

function rejectUpgrade(socket, status, reason) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });

server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => socket.destroy());

  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    rejectUpgrade(socket, 400, 'Bad Request');
    return;
  }
  if (pathname !== '/') {
    rejectUpgrade(socket, 404, 'Not Found');
    return;
  }

  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(req.headers.origin)) {
    rejectUpgrade(socket, 403, 'Forbidden');
    return;
  }

  const ip = getClientIp(req);
  if (isIpLocked(ip)) {
    rejectUpgrade(socket, 429, 'Too Many Requests');
    return;
  }
  if (wss.clients.size >= MAX_CONNECTIONS || (connectionsPerIp.get(ip) || 0) >= MAX_CONNECTIONS_PER_IP) {
    rejectUpgrade(socket, 503, 'Service Unavailable');
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, ip);
  });
});

wss.on('connection', (ws, req, ip) => {
  connectionsPerIp.set(ip, (connectionsPerIp.get(ip) || 0) + 1);

  let authenticated = false;
  let authFailures = 0;
  let currentRoomId = null;
  let currentPlayerId = null;
  let messageBudget = MESSAGES_PER_SECOND;
  let budgetResetAt = Date.now() + 1000;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', (err) => console.warn(`WebSocket error from ${ip}:`, err.message));

  const authTimer = setTimeout(() => {
    if (!authenticated) ws.close(1008, 'Authentication timeout');
  }, AUTH_TIMEOUT_MS);

  const sendJson = (data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  };

  sendJson({
    type: 'CONNECTION_ACK',
    requiresPassword: true
  });

  ws.on('message', (message, isBinary) => {
    const now = Date.now();
    if (now >= budgetResetAt) {
      messageBudget = MESSAGES_PER_SECOND;
      budgetResetAt = now + 1000;
    }
    if (--messageBudget < 0) {
      ws.close(1008, 'Rate limit exceeded');
      return;
    }

    try {
      if (isBinary) throw new Error('Binary messages are not supported');
      const data = JSON.parse(message);
      if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.type !== 'string') {
        throw new Error('Malformed message');
      }

      if (data.type === 'AUTH') {
        if (authenticated) return;
        if (isIpLocked(ip)) {
          ws.close(1008, 'Too many authentication failures');
          return;
        }
        if (passwordMatches(data.password)) {
          authenticated = true;
          authFailures = 0;
          clearTimeout(authTimer);
          sendJson({ type: 'AUTH_SUCCESS' });
        } else {
          authFailures += 1;
          recordAuthFailure(ip);
          sendJson({ type: 'AUTH_ERROR', message: 'Incorrect password' });
          if (authFailures >= MAX_AUTH_FAILURES || isIpLocked(ip)) {
            ws.close(1008, 'Too many authentication failures');
          }
        }
        return;
      }

      if (!authenticated) {
        sendJson({ type: 'ERROR', message: 'Unauthorized. Please authenticate first.' });
        return;
      }

      switch (data.type) {
        case 'CREATE_ROOM': {
          if (currentRoomId) {
            sendJson({ type: 'ERROR', message: 'You are already in a room' });
            break;
          }
          const result = roomManager.createRoom(data.playerName, ws);
          if (result.error) {
            sendJson({ type: 'ERROR', message: result.error });
            break;
          }
          const { room, player } = result;
          currentRoomId = room.id;
          currentPlayerId = player.id;
          sendJson({
            type: 'ROOM_JOINED',
            roomId: room.id,
            playerId: player.id,
            isHost: true,
            players: room.players.map(publicPlayer)
          });
          break;
        }

        case 'JOIN_ROOM': {
          if (currentRoomId) {
            sendJson({ type: 'ERROR', message: 'You are already in a room' });
            break;
          }
          if (typeof data.roomId !== 'string' || !/^[A-Z0-9]{4}$/i.test(data.roomId)) {
            sendJson({ type: 'ERROR', message: 'Invalid room code' });
            break;
          }

          const result = roomManager.joinRoom(data.roomId.toUpperCase(), data.playerName, ws);
          if (result.error) {
            sendJson({ type: 'ERROR', message: result.error });
          } else {
            const { room, player } = result;
            currentRoomId = room.id;
            currentPlayerId = player.id;
            sendJson({
              type: 'ROOM_JOINED',
              roomId: room.id,
              playerId: player.id,
              isHost: player.isHost,
              players: room.players.map(publicPlayer)
            });
            room.broadcast({
              type: 'PLAYER_JOINED',
              players: room.players.map(publicPlayer)
            });
          }
          break;
        }

        case 'START_GAME': {
          const result = roomManager.startGame(currentRoomId, currentPlayerId, data.parcourId);
          if (result.error) {
            sendJson({ type: 'ERROR', message: result.error });
          } else {
            const room = result.room;
            room.broadcast({
              type: 'GAME_STARTED',
              courseIndex: room.currentCourseIndex,
              course: room.currentCourse,
              players: room.players.map(publicPlayer),
              activePlayerId: room.players[room.activePlayerIndex].id
            });
          }
          break;
        }

        case 'SHOOT': {
          const result = roomManager.shootBall(currentRoomId, currentPlayerId, data.angle, data.power);
          if (result.error) {
            sendJson({ type: 'ERROR', message: result.error });
          }
          break;
        }

        case 'SKIP_HOLE': {
          const result = roomManager.skipHole(currentRoomId, currentPlayerId);
          if (result.error) {
            sendJson({ type: 'ERROR', message: result.error });
          }
          break;
        }

        default:
          sendJson({ type: 'ERROR', message: 'Unknown message type' });
          break;
      }
    } catch (e) {
      console.warn(`WebSocket message error from ${ip}:`, e.message);
      sendJson({ type: 'ERROR', message: 'Invalid message payload' });
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    const remaining = (connectionsPerIp.get(ip) || 1) - 1;
    if (remaining > 0) connectionsPerIp.set(ip, remaining);
    else connectionsPerIp.delete(ip);
    roomManager.removePlayer(ws);
  });
});

// Drop connections that stop answering pings (half-open TCP, sleeping phones)
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

server.listen(PORT, HOST, () => {
  console.log(`Mini-Golf 2D server running on ${HOST}:${PORT}`);
  console.log('Password protection: ENABLED');
  console.log(`Trust proxy: ${TRUST_PROXY ? 'ENABLED (X-Real-IP)' : 'disabled'}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ') || '(any)'}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, 'Server shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
