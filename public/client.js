/**
 * Mini-Golf 2D Multiplayer Client
 * Vanilla JS + Canvas 2D + Web Audio API + WebSocket
 */

// ================= AUDIO SYNTHESIZER =================
class SoundEffects {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playPutt() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  playBounce() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.06);
  }

  playBumper() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(780, this.ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  playHole() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  playSplash() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
}

const sfx = new SoundEffects();

// ================= GAME CLIENT STATE =================
const state = {
  ws: null,
  myId: null,
  isHost: false,
  roomId: null,
  players: [],
  activePlayerId: null,
  currentCourse: null,
  currentCourseIndex: 0,
  balls: {}, // playerId -> { x, y, vx, vy, active, sunk }

  // Drag & Aim controls
  isAiming: false,
  aimStartX: 0,
  aimStartY: 0,
  aimCurrentX: 0,
  aimCurrentY: 0,
  aimPower: 0,
  aimAngle: 0
};

// ================= DOM ELEMENTS =================
const screens = {
  password: document.getElementById('screen-password'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game')
};

const overlayGameOver = document.getElementById('overlay-gameover');
const passwordInput = document.getElementById('password-input');
const btnAuth = document.getElementById('btn-auth');
const authError = document.getElementById('auth-error');

const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code-input');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const lobbyError = document.getElementById('lobby-error');
const roomPanel = document.getElementById('room-panel');
const roomCodeDisplay = document.getElementById('room-code-display');
const btnCopyCode = document.getElementById('btn-copy-code');
const lobbyPlayersList = document.getElementById('lobby-players');
const btnStart = document.getElementById('btn-start');
const lobbyStatus = document.getElementById('lobby-status');

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const holeBanner = document.getElementById('hole-banner');
const turnBanner = document.getElementById('turn-banner');
const shotMsg = document.getElementById('shot-msg');
const scoreTable = document.getElementById('score-table');
const btnLeave = document.getElementById('btn-leave');
const finalScores = document.getElementById('final-scores');
const btnBackLobby = document.getElementById('btn-back-lobby');

// Show screen helper
function showScreen(screenKey) {
  for (const key in screens) {
    screens[key].classList.toggle('hidden', key !== screenKey);
  }
}

// Auto-fill room code from URL hash if present
const urlHash = window.location.hash.replace('#', '').trim().toUpperCase();
if (urlHash && urlHash.length === 4) {
  roomCodeInput.value = urlHash;
}

// ================= WEBSOCKET CONNECTION =================
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    console.log('Connected to Mini-Golf Server');
  };

  state.ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };

  state.ws.onclose = () => {
    console.log('Disconnected from server. Reconnecting in 2s...');
    setTimeout(connectWebSocket, 2000);
  };
}

function send(type, payload = {}) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type, ...payload }));
  }
}

// ================= MESSAGE HANDLERS =================
function handleServerMessage(data) {
  switch (data.type) {
    case 'CONNECTION_ACK':
      if (data.requiresPassword) {
        showScreen('password');
      } else {
        showScreen('lobby');
      }
      break;

    case 'AUTH_SUCCESS':
      showScreen('lobby');
      authError.classList.add('hidden');
      break;

    case 'AUTH_ERROR':
      authError.textContent = data.message;
      authError.classList.remove('hidden');
      break;

    case 'ROOM_JOINED':
      state.roomId = data.roomId;
      state.myId = data.playerId;
      state.isHost = data.isHost;
      state.players = data.players;
      window.location.hash = data.roomId;
      updateLobbyUI();
      break;

    case 'PLAYER_JOINED':
      state.players = data.players;
      updateLobbyUI();
      break;

    case 'PLAYER_LEFT':
      state.players = data.players;
      const host = data.players.find(p => p.isHost);
      if (host && host.id === state.myId) {
        state.isHost = true;
      }
      updateLobbyUI();
      updateScoreboard();
      break;

    case 'GAME_STARTED':
      state.currentCourseIndex = data.courseIndex;
      state.currentCourse = data.course;
      state.players = data.players;
      state.activePlayerId = data.activePlayerId;
      initBalls(data.players);
      showScreen('game');
      updateCourseUI();
      updateTurnUI();
      updateScoreboard();
      break;

    case 'NEXT_HOLE':
      state.currentCourseIndex = data.courseIndex;
      state.currentCourse = data.course;
      state.players = data.players;
      initBalls(data.players);
      updateCourseUI();
      updateScoreboard();
      showShotMessage(`Hole ${data.courseIndex + 1}!`);
      break;

    case 'PHYSICS_UPDATE':
      for (const b of data.balls) {
        if (!state.balls[b.id]) {
          state.balls[b.id] = { ...b };
        } else {
          // Smooth interpolation target
          state.balls[b.id].targetX = b.x;
          state.balls[b.id].targetY = b.y;
          state.balls[b.id].vx = b.vx;
          state.balls[b.id].vy = b.vy;
          state.balls[b.id].active = b.active;
          state.balls[b.id].sunk = b.sunk;
        }
      }
      break;

    case 'PLAYER_SHOOT': {
      sfx.playPutt();
      const p = state.players.find(pl => pl.id === data.playerId);
      if (p) {
        p.strokes = data.strokes;
        p.score = data.totalScore;
      }
      updateScoreboard();
      break;
    }

    case 'TURN_UPDATE':
      state.activePlayerId = data.activePlayerId;
      updateTurnUI();
      break;

    case 'BALL_SUNK': {
      sfx.playHole();
      const sunkPlayer = state.players.find(p => p.id === data.playerId);
      if (sunkPlayer) {
        sunkPlayer.sunk = true;
        if (state.balls[sunkPlayer.id]) state.balls[sunkPlayer.id].sunk = true;
        showShotMessage(`${sunkPlayer.name} sank it! ⛳`);
      }
      break;
    }

    case 'HAZARD_HIT': {
      sfx.playSplash();
      const p = state.players.find(pl => pl.id === data.playerId);
      if (p) {
        p.strokes = data.strokes;
        showShotMessage(`${p.name} hit the water! (+1) 💦`);
      }
      updateScoreboard();
      break;
    }

    case 'GAME_FINISHED':
      state.players = data.players;
      showGameOver();
      break;

    case 'ERROR':
      if (screens.lobby.classList.contains('hidden')) {
        alert(data.message);
      } else {
        lobbyError.textContent = data.message;
        lobbyError.classList.remove('hidden');
      }
      break;
  }
}

function initBalls(players) {
  state.balls = {};
  for (const p of players) {
    state.balls[p.id] = {
      x: p.ball ? p.ball.x : state.currentCourse.tee.x,
      y: p.ball ? p.ball.y : state.currentCourse.tee.y,
      targetX: p.ball ? p.ball.x : state.currentCourse.tee.x,
      targetY: p.ball ? p.ball.y : state.currentCourse.tee.y,
      vx: 0,
      vy: 0,
      active: true,
      sunk: false
    };
  }
}

// ================= UI UPDATERS =================
function updateLobbyUI() {
  roomPanel.classList.remove('hidden');
  roomCodeDisplay.textContent = state.roomId;
  lobbyPlayersList.innerHTML = '';

  for (const p of state.players) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="player-dot" style="background: ${p.color}"></span>
      <span>${p.name} ${p.id === state.myId ? '(You)' : ''}</span>
      ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
    `;
    lobbyPlayersList.appendChild(li);
  }

  if (state.isHost) {
    btnStart.classList.remove('hidden');
    lobbyStatus.textContent = `${state.players.length}/7 players in lobby. Ready to start!`;
  } else {
    btnStart.classList.add('hidden');
    lobbyStatus.textContent = `Waiting for host to start the game... (${state.players.length}/7)`;
  }
}

function updateCourseUI() {
  if (!state.currentCourse) return;
  holeBanner.textContent = `${state.currentCourse.name} — Par ${state.currentCourse.par}`;
}

function updateTurnUI() {
  const activePlayer = state.players.find(p => p.id === state.activePlayerId);
  const isMyTurn = state.activePlayerId === state.myId;

  if (activePlayer) {
    turnBanner.textContent = isMyTurn ? "👉 YOUR TURN! Drag & Release to shoot" : `🏌️ ${activePlayer.name}'s turn...`;
    turnBanner.classList.toggle('my-turn', isMyTurn);
  }
}

function updateScoreboard() {
  scoreTable.innerHTML = '';
  // Sort by total score ascending
  const sorted = [...state.players].sort((a, b) => (a.score || 0) - (b.score || 0));

  for (const p of sorted) {
    const row = document.createElement('div');
    row.className = `score-row ${p.id === state.activePlayerId ? 'active' : ''}`;
    row.innerHTML = `
      <div class="name-col">
        <span class="player-dot" style="background: ${p.color}"></span>
        <span>${p.name}</span>
      </div>
      <div class="score-col">${p.score || 0} pts (${p.strokes || 0})</div>
    `;
    scoreTable.appendChild(row);
  }
}

function showShotMessage(text) {
  shotMsg.textContent = text;
  shotMsg.classList.remove('hidden');
  setTimeout(() => {
    shotMsg.classList.add('hidden');
  }, 2000);
}

function showGameOver() {
  overlayGameOver.classList.remove('hidden');
  finalScores.innerHTML = '';
  const sorted = [...state.players].sort((a, b) => (a.score || 0) - (b.score || 0));

  sorted.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = `final-score-item ${idx === 0 ? 'winner' : ''}`;
    item.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <span style="font-weight:bold;color:#f59e0b;">#${idx + 1}</span>
        <span class="player-dot" style="background: ${p.color}"></span>
        <span style="font-weight:600;">${p.name}</span>
      </div>
      <span style="font-weight:bold;color:#38bdf8;">${p.score || 0} strokes</span>
    `;
    finalScores.appendChild(item);
  });
}

// ================= EVENT LISTENERS =================
btnAuth.addEventListener('click', () => {
  sfx.init();
  const password = passwordInput.value.trim();
  send('AUTH', { password });
});

passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnAuth.click();
});

btnCreate.addEventListener('click', () => {
  sfx.init();
  const name = playerNameInput.value.trim() || 'Player 1';
  send('CREATE_ROOM', { playerName: name });
});

btnJoin.addEventListener('click', () => {
  sfx.init();
  const name = playerNameInput.value.trim() || 'Player';
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    lobbyError.textContent = 'Please enter a room code';
    lobbyError.classList.remove('hidden');
    return;
  }
  send('JOIN_ROOM', { roomId: code, playerName: name });
});

btnStart.addEventListener('click', () => {
  sfx.init();
  send('START_GAME', { roomId: state.roomId });
});

btnCopyCode.addEventListener('click', () => {
  const inviteUrl = `${window.location.origin}/#${state.roomId}`;
  navigator.clipboard.writeText(inviteUrl).then(() => {
    const orig = btnCopyCode.textContent;
    btnCopyCode.textContent = '✅ Copied!';
    setTimeout(() => btnCopyCode.textContent = orig, 1500);
  });
});

btnLeave.addEventListener('click', () => {
  window.location.reload();
});

btnBackLobby.addEventListener('click', () => {
  overlayGameOver.classList.add('hidden');
  showScreen('lobby');
});

// ================= CANVAS CONTROLS & AIMING =================
function getCanvasMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

canvas.addEventListener('mousedown', (e) => {
  sfx.init();
  if (state.activePlayerId !== state.myId) return;

  const myBall = state.balls[state.myId];
  if (!myBall || !myBall.active || myBall.sunk) return;
  if (Math.abs(myBall.vx) > 0.05 || Math.abs(myBall.vy) > 0.05) return; // Ball is moving

  const mouse = getCanvasMousePos(e);
  const dx = mouse.x - myBall.x;
  const dy = mouse.y - myBall.y;

  // If clicked near ball or anywhere to drag
  state.isAiming = true;
  state.aimStartX = myBall.x;
  state.aimStartY = myBall.y;
  state.aimCurrentX = mouse.x;
  state.aimCurrentY = mouse.y;
});

window.addEventListener('mousemove', (e) => {
  if (!state.isAiming) return;
  const mouse = getCanvasMousePos(e);
  state.aimCurrentX = mouse.x;
  state.aimCurrentY = mouse.y;

  // Calculate pull vector (pull back to shoot forward like a slingshot)
  const dx = state.aimStartX - state.aimCurrentX;
  const dy = state.aimStartY - state.aimCurrentY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  state.aimPower = Math.min(dist / 8, 22); // Max power 22
  state.aimAngle = Math.atan2(dy, dx);
});

window.addEventListener('mouseup', () => {
  if (!state.isAiming) return;
  state.isAiming = false;

  if (state.aimPower > 0.8) {
    send('SHOOT', {
      angle: state.aimAngle,
      power: state.aimPower
    });
  }
});

// Touch support for mobile Safari/Chrome
canvas.addEventListener('touchstart', (e) => {
  sfx.init();
  if (e.touches.length > 0) {
    const t = e.touches[0];
    const mouse = getCanvasMousePos(t);
    const myBall = state.balls[state.myId];
    if (!myBall || !myBall.active || myBall.sunk) return;
    if (Math.abs(myBall.vx) > 0.05 || Math.abs(myBall.vy) > 0.05) return;

    state.isAiming = true;
    state.aimStartX = myBall.x;
    state.aimStartY = myBall.y;
    state.aimCurrentX = mouse.x;
    state.aimCurrentY = mouse.y;
  }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
  if (!state.isAiming || e.touches.length === 0) return;
  const t = e.touches[0];
  const mouse = getCanvasMousePos(t);
  state.aimCurrentX = mouse.x;
  state.aimCurrentY = mouse.y;

  const dx = state.aimStartX - state.aimCurrentX;
  const dy = state.aimStartY - state.aimCurrentY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  state.aimPower = Math.min(dist / 8, 22);
  state.aimAngle = Math.atan2(dy, dx);
});

window.addEventListener('touchend', () => {
  if (!state.isAiming) return;
  state.isAiming = false;

  if (state.aimPower > 0.8) {
    send('SHOOT', {
      angle: state.aimAngle,
      power: state.aimPower
    });
  }
});

// ================= CANVAS 2D RENDER LOOP =================
let animTime = 0;

function render() {
  animTime += 0.03;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const course = state.currentCourse;
  if (!course) {
    requestAnimationFrame(render);
    return;
  }

  // 1. Draw Green Fairway Turf & Checkerboard Pattern
  ctx.fillStyle = '#15803d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle turf stripes
  ctx.fillStyle = '#16a34a';
  for (let x = 50; x < canvas.width - 50; x += 40) {
    if ((x / 40) % 2 === 0) {
      ctx.fillRect(x, 50, 40, canvas.height - 100);
    }
  }

  // 2. Draw Hazards
  if (course.hazards) {
    for (const h of course.hazards) {
      if (h.type === 'sand') {
        // Sand trap
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.roundRect(h.x, h.y, h.width, h.height, 12);
        ctx.fill();
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Texture dots
        ctx.fillStyle = '#b45309';
        for (let sx = h.x + 10; sx < h.x + h.width - 10; sx += 20) {
          for (let sy = h.y + 10; sy < h.y + h.height - 10; sy += 20) {
            ctx.fillRect(sx, sy, 3, 3);
          }
        }
      } else if (h.type === 'water') {
        // Water hazard with animated wave
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.roundRect(h.x, h.y, h.width, h.height, 12);
        ctx.fill();
        ctx.strokeStyle = '#0369a1';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Wave ripples
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let wx = h.x + 15; wx < h.x + h.width - 15; wx += 30) {
          const waveOffset = Math.sin(animTime + wx) * 3;
          ctx.moveTo(wx, h.y + h.height / 2 + waveOffset);
          ctx.lineTo(wx + 15, h.y + h.height / 2 + waveOffset);
        }
        ctx.stroke();
      }
    }
  }

  // 3. Draw Tee Off Zone
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(course.tee.x, course.tee.y, course.tee.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fill();

  // 4. Draw Hole & Flag
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(course.hole.x, course.hole.y, course.hole.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Flag pole
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(course.hole.x, course.hole.y);
  ctx.lineTo(course.hole.x, course.hole.y - 30);
  ctx.stroke();

  // Waving red flag
  ctx.fillStyle = '#ef4444';
  const flagWave = Math.sin(animTime * 2) * 2;
  ctx.beginPath();
  ctx.moveTo(course.hole.x, course.hole.y - 30);
  ctx.lineTo(course.hole.x + 16 + flagWave, course.hole.y - 23);
  ctx.lineTo(course.hole.x, course.hole.y - 16);
  ctx.closePath();
  ctx.fill();

  // 5. Draw Walls
  if (course.walls) {
    ctx.strokeStyle = '#78350f'; // Wood rail
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    for (const w of course.walls) {
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }

    // Inner rail highlight
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 8;
    for (const w of course.walls) {
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }
  }

  // 6. Draw Circular Bumpers
  if (course.bumpers) {
    for (const b of course.bumpers) {
      // Glow effect
      ctx.shadowBlur = 10;
      ctx.shadowColor = b.color || '#f59e0b';

      ctx.fillStyle = b.color || '#f59e0b';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();

      // Bumper border
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Center ring
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 7. Render & Interpolate Golf Balls
  for (const player of state.players) {
    const ball = state.balls[player.id];
    if (!ball || ball.sunk) continue;

    // Smooth interpolation
    if (ball.targetX !== undefined) {
      ball.x += (ball.targetX - ball.x) * 0.4;
      ball.y += (ball.targetY - ball.y) * 0.4;
    }

    // Ball Drop Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(ball.x + 3, ball.y + 3, 12, 0, Math.PI * 2);
    ctx.fill();

    // Ball Body
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 12, 0, Math.PI * 2);
    ctx.fill();

    // 3D Gloss Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(ball.x - 3, ball.y - 3, 4, 0, Math.PI * 2);
    ctx.fill();

    // Player Initial
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.name.charAt(0).toUpperCase(), ball.x, ball.y + 1);

    // Active Player Indicator Ring
    if (player.id === state.activePlayerId) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const ringRadius = 16 + Math.sin(animTime * 4) * 2;
      ctx.arc(ball.x, ball.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 8. Aiming Trajectory & Slingshot Indicator
  if (state.isAiming && state.activePlayerId === state.myId) {
    const myBall = state.balls[state.myId];
    if (myBall) {
      // Slingshot pull line (from ball to drag point)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(myBall.x, myBall.y);
      ctx.lineTo(state.aimCurrentX, state.aimCurrentY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Forward shot trajectory line
      const length = state.aimPower * 7;
      const endX = myBall.x + Math.cos(state.aimAngle) * length;
      const endY = myBall.y + Math.sin(state.aimAngle) * length;

      // Color based on power (green -> yellow -> red)
      const powerRatio = state.aimPower / 22;
      const powerColor = powerRatio > 0.6 ? '#ef4444' : powerRatio > 0.3 ? '#f59e0b' : '#22c55e';

      ctx.strokeStyle = powerColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(myBall.x, myBall.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Target pointer dot
      ctx.fillStyle = powerColor;
      ctx.beginPath();
      ctx.arc(endX, endY, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  requestAnimationFrame(render);
}

// Start WebSocket connection & Canvas loop
connectWebSocket();
requestAnimationFrame(render);
