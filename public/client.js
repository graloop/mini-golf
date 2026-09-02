/**
 * Mini-Golf 2D Multiplayer Client
 * Vanilla JS + Canvas 2D + WebSocket (silent — no audio)
 */

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

const MAX_AIM_POWER = 17; // Shots are noticeably less powerful than before

// ================= DOM ELEMENTS =================
const screens = {
  password: document.getElementById('screen-password'),
  lobby: document.getElementById('screen-lobby'),
  selectCourse: document.getElementById('screen-select-course'),
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

const btnBackToLobby = document.getElementById('btn-back-to-lobby');
const selectCourseError = document.getElementById('select-course-error');
const parcourSelectButtons = document.querySelectorAll('.btn-select-parcour');

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const holeBanner = document.getElementById('hole-banner');
const turnBanner = document.getElementById('turn-banner');
const shotMsg = document.getElementById('shot-msg');
const scoreTable = document.getElementById('score-table');
const btnLeave = document.getElementById('btn-leave');
const btnSkipHole = document.getElementById('btn-skip-hole');
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
      updateHostControls();
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
      updateHostControls();
      break;

    case 'NEXT_HOLE':
      state.currentCourseIndex = data.courseIndex;
      state.currentCourse = data.course;
      state.players = data.players;
      state.activePlayerId = data.activePlayerId;
      initBalls(data.players);
      updateCourseUI();
      updateTurnUI();
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
      const sunkPlayer = state.players.find(p => p.id === data.playerId);
      if (sunkPlayer) {
        sunkPlayer.sunk = true;
        if (state.balls[sunkPlayer.id]) state.balls[sunkPlayer.id].sunk = true;
        showShotMessage(`${sunkPlayer.name} sank it! ⛳`);
      }
      break;
    }

    case 'HAZARD_HIT': {
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
      if (!screens.selectCourse.classList.contains('hidden')) {
        selectCourseError.textContent = data.message;
        selectCourseError.classList.remove('hidden');
      } else if (!screens.lobby.classList.contains('hidden')) {
        lobbyError.textContent = data.message;
        lobbyError.classList.remove('hidden');
      } else {
        alert(data.message);
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

function updateHostControls() {
  btnSkipHole.classList.toggle('hidden', !state.isHost);
}

function updateTurnUI() {
  const activePlayer = state.players.find(p => p.id === state.activePlayerId);
  const isMyTurn = state.activePlayerId === state.myId;

  if (activePlayer) {
    turnBanner.textContent = isMyTurn ? "Your Turn" : `${activePlayer.name}'s Turn`;
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
  const password = passwordInput.value.trim();
  send('AUTH', { password });
});

passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnAuth.click();
});

btnCreate.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || 'Player 1';
  send('CREATE_ROOM', { playerName: name });
});

btnJoin.addEventListener('click', () => {
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
  selectCourseError.classList.add('hidden');
  showScreen('selectCourse');
});

btnBackToLobby.addEventListener('click', () => {
  showScreen('lobby');
});

parcourSelectButtons.forEach((btn) => {
  if (btn.disabled) return;
  btn.addEventListener('click', () => {
    const parcourId = btn.dataset.parcour;
    send('START_GAME', { roomId: state.roomId, parcourId });
  });
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

btnSkipHole.addEventListener('click', () => {
  if (!confirm('Skip this hole for everyone and move to the next one?')) return;
  send('SKIP_HOLE', { roomId: state.roomId });
});

btnBackLobby.addEventListener('click', () => {
  overlayGameOver.classList.add('hidden');
  showScreen('lobby');
});

// ================= CAMERA (fit any course size into the fixed canvas) =================
function getCourseTransform(course) {
  const scale = Math.min(canvas.width / course.width, canvas.height / course.height);
  const offsetX = (canvas.width - course.width * scale) / 2;
  const offsetY = (canvas.height - course.height * scale) / 2;
  return { scale, offsetX, offsetY };
}

// ================= CANVAS CONTROLS & AIMING =================
function getCanvasMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (e.clientX - rect.left) * scaleX;
  const canvasY = (e.clientY - rect.top) * scaleY;

  if (!state.currentCourse) return { x: canvasX, y: canvasY };

  // Convert from physical canvas pixels back into course (world) coordinates
  const { scale, offsetX, offsetY } = getCourseTransform(state.currentCourse);
  return {
    x: (canvasX - offsetX) / scale,
    y: (canvasY - offsetY) / scale
  };
}

canvas.addEventListener('mousedown', (e) => {
  if (state.activePlayerId !== state.myId) return;

  const myBall = state.balls[state.myId];
  if (!myBall || !myBall.active || myBall.sunk) return;
  if (Math.abs(myBall.vx) > 0.05 || Math.abs(myBall.vy) > 0.05) return; // Ball is moving

  const mouse = getCanvasMousePos(e);

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

  state.aimPower = Math.min(dist / 9, MAX_AIM_POWER);
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

  state.aimPower = Math.min(dist / 9, MAX_AIM_POWER);
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

// ================= PROCEDURAL TEXTURES =================
// Deterministic PRNG so generated textures don't flicker/re-randomize on redraw.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const textureCache = {
  grass: null,
  grassCourseId: null,
  sand: new Map() // hazard index -> { canvas, x, y }
};

function generateGrassTexture(width, height) {
  const tex = document.createElement('canvas');
  tex.width = width;
  tex.height = height;
  const tctx = tex.getContext('2d');
  const rand = mulberry32(1337);

  // Base turf gradient
  const grad = tctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#1b8a45');
  grad.addColorStop(1, '#15803d');
  tctx.fillStyle = grad;
  tctx.fillRect(0, 0, width, height);

  // Mowed stripe bands, like a real fairway
  const stripeWidth = 40;
  for (let x = 0; x < width; x += stripeWidth) {
    if ((x / stripeWidth) % 2 === 0) {
      tctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      tctx.fillRect(x, 0, stripeWidth, height);
    } else {
      tctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
      tctx.fillRect(x, 0, stripeWidth, height);
    }
  }

  // Scattered grass-blade strokes for an organic, textured look
  const bladeCount = Math.floor((width * height) / 70);
  for (let i = 0; i < bladeCount; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const len = 2 + rand() * 4;
    const angle = -Math.PI / 2 + (rand() - 0.5) * 1.0;
    const light = rand() > 0.5;
    tctx.strokeStyle = light
      ? `rgba(74, 222, 128, ${0.10 + rand() * 0.14})`
      : `rgba(6, 78, 34, ${0.12 + rand() * 0.16})`;
    tctx.lineWidth = 1;
    tctx.beginPath();
    tctx.moveTo(x, y);
    tctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    tctx.stroke();
  }

  // Subtle vignette so the edges read as turf receding, not a flat fill
  const vignette = tctx.createRadialGradient(
    width / 2, height / 2, height * 0.15,
    width / 2, height / 2, height * 0.8
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
  tctx.fillStyle = vignette;
  tctx.fillRect(0, 0, width, height);

  return tex;
}

// Smooth closed path through a ring of points (quadratic curve through edge
// midpoints) — turns a jittered polygon into a soft, natural bunker outline.
function smoothBlobPath(c, points) {
  c.beginPath();
  const n = points.length;
  const start = {
    x: (points[0].x + points[n - 1].x) / 2,
    y: (points[0].y + points[n - 1].y) / 2
  };
  c.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const curr = points[i];
    const next = points[(i + 1) % n];
    const mid = { x: (curr.x + next.x) / 2, y: (curr.y + next.y) / 2 };
    c.quadraticCurveTo(curr.x, curr.y, mid.x, mid.y);
  }
  c.closePath();
}

function generateSandTexture(hazard, seed) {
  const pad = 10;
  const xs = hazard.points.map(p => p.x);
  const ys = hazard.points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;

  const tex = document.createElement('canvas');
  tex.width = w;
  tex.height = h;
  const tctx = tex.getContext('2d');
  const rand = mulberry32(seed);

  // Points local to this small texture canvas
  const localPoints = hazard.points.map(p => ({ x: p.x - minX + pad, y: p.y - minY + pad }));

  // Soft drop shadow lifts the bunker off the grass
  tctx.save();
  tctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  tctx.shadowBlur = 8;
  tctx.shadowOffsetY = 3;
  tctx.fillStyle = '#c98a2c';
  smoothBlobPath(tctx, localPoints);
  tctx.fill();
  tctx.restore();

  // Warm sandy gradient, distinct from grass and walls at a glance
  const grad = tctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#f2c572');
  grad.addColorStop(0.55, '#e0a94a');
  grad.addColorStop(1, '#c98a2c');
  tctx.fillStyle = grad;
  smoothBlobPath(tctx, localPoints);
  tctx.fill();

  tctx.save();
  smoothBlobPath(tctx, localPoints);
  tctx.clip();

  // Raked wavy lines for a classic bunker look
  tctx.strokeStyle = 'rgba(150, 100, 40, 0.35)';
  tctx.lineWidth = 2;
  for (let ry = 6; ry < h; ry += 11) {
    tctx.beginPath();
    for (let rx = 0; rx <= w; rx += 6) {
      const wobble = Math.sin((rx + ry) * 0.15) * 2.5;
      if (rx === 0) tctx.moveTo(rx, ry + wobble);
      else tctx.lineTo(rx, ry + wobble);
    }
    tctx.stroke();
  }

  // Grainy speckles for texture
  const grainCount = Math.floor((w * h) / 26);
  for (let i = 0; i < grainCount; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const size = 0.8 + rand() * 1.8;
    tctx.fillStyle = rand() > 0.5
      ? `rgba(255, 240, 200, ${0.25 + rand() * 0.3})`
      : `rgba(120, 74, 26, ${0.25 + rand() * 0.3})`;
    tctx.beginPath();
    tctx.arc(x, y, size, 0, Math.PI * 2);
    tctx.fill();
  }
  tctx.restore();

  // Crisp border makes the bunker easy to spot at a glance
  tctx.strokeStyle = '#7c4a12';
  tctx.lineWidth = 3;
  smoothBlobPath(tctx, localPoints);
  tctx.stroke();

  // Slightly inset highlight ring for depth
  const cx = w / 2, cy = h / 2;
  const innerPoints = localPoints.map(p => ({
    x: p.x + (cx - p.x) * 0.06,
    y: p.y + (cy - p.y) * 0.06
  }));
  tctx.strokeStyle = 'rgba(255, 220, 160, 0.5)';
  tctx.lineWidth = 1.5;
  smoothBlobPath(tctx, innerPoints);
  tctx.stroke();

  return { canvas: tex, x: minX - pad, y: minY - pad };
}

function ensureCourseTextures(course) {
  if (textureCache.grassCourseId !== course.id) {
    textureCache.grass = generateGrassTexture(course.width, course.height);
    textureCache.grassCourseId = course.id;
    textureCache.sand = new Map();
  }
  if (course.hazards) {
    course.hazards.forEach((h, idx) => {
      if (h.type === 'sand' && !textureCache.sand.has(idx)) {
        textureCache.sand.set(idx, generateSandTexture(h, course.id * 1000 + idx + 1));
      }
    });
  }
}

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

  // Letterbox backdrop behind courses whose aspect ratio doesn't match the canvas
  ctx.fillStyle = '#0b3d24';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Fit this course's (possibly much larger) world space into the fixed canvas
  const { scale, offsetX, offsetY } = getCourseTransform(course);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // 1. Draw Grass Texture Fairway (procedural turf with mowed stripes & blades)
  ensureCourseTextures(course);
  if (textureCache.grass) {
    ctx.drawImage(textureCache.grass, 0, 0);
  } else {
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, 0, course.width, course.height);
  }

  // 2. Draw Hazards
  if (course.hazards) {
    course.hazards.forEach((h, idx) => {
      if (h.type === 'sand') {
        // Fancy irregular bunker (gradient, rake lines, speckles, crisp border)
        const sandTex = textureCache.sand.get(idx);
        if (sandTex) {
          ctx.drawImage(sandTex.canvas, sandTex.x, sandTex.y);
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
    });
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

  // 4. Draw Hole — textured cup (soft AO halo + radial-gradient depth) with a
  // light magnetic pull ring sitting just past the rim.
  const holeAOGrad = ctx.createRadialGradient(
    course.hole.x, course.hole.y, course.hole.radius * 0.3,
    course.hole.x, course.hole.y, course.hole.radius * 2.2
  );
  holeAOGrad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  holeAOGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.18)');
  holeAOGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = holeAOGrad;
  ctx.beginPath();
  ctx.arc(course.hole.x, course.hole.y, course.hole.radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  const cupGrad = ctx.createRadialGradient(
    course.hole.x, course.hole.y - course.hole.radius * 0.2, course.hole.radius * 0.15,
    course.hole.x, course.hole.y, course.hole.radius
  );
  cupGrad.addColorStop(0, '#3f3f46');
  cupGrad.addColorStop(0.4, '#18181b');
  cupGrad.addColorStop(1, '#000000');
  ctx.fillStyle = cupGrad;
  ctx.beginPath();
  ctx.arc(course.hole.x, course.hole.y, course.hole.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(course.hole.x, course.hole.y, course.hole.radius, 0, Math.PI * 2);
  ctx.stroke();

  // Light magnetic pull ring — matches the server's small attraction radius
  const attractRadius = course.hole.radius * 1.2;
  const pulse = (Math.sin(animTime * 1.6) + 1) / 2;
  ctx.strokeStyle = `rgba(250, 204, 21, ${0.18 + pulse * 0.14})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(course.hole.x, course.hole.y, attractRadius, 0, Math.PI * 2);
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

  // 6. Render & Interpolate Golf Balls
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

  // 7. Aiming Trajectory & Slingshot Indicator
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
      const powerRatio = state.aimPower / MAX_AIM_POWER;
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

  ctx.restore();

  requestAnimationFrame(render);
}

// Start WebSocket connection & Canvas loop
connectWebSocket();
requestAnimationFrame(render);
