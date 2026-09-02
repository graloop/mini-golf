/**
 * Room and Game State Manager
 * Handles player sessions, game lobbies (up to 7 players), turn progression,
 * course transitions, and memory cleanup for inactive rooms.
 */

const { COURSES } = require('./courses');
const { PhysicsEngine } = require('./physicsEngine');

const PLAYER_COLORS = [
  "#ef4444", // Red
  "#3b82f6", // Blue
  "#10b981", // Green
  "#f59e0b", // Amber
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4"  // Cyan
];

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> Room object
    this.physics = new PhysicsEngine();

    // Cleanup inactive rooms every 10 minutes
    setInterval(() => this.cleanupInactiveRooms(), 10 * 60 * 1000);
  }

  generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (this.rooms.has(code)) return this.generateRoomCode();
    return code;
  }

  createRoom(hostPlayerName, ws) {
    const roomId = this.generateRoomCode();
    const room = {
      id: roomId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      status: "lobby", // "lobby", "playing", "finished"
      currentCourseIndex: 0,
      currentCourse: null,
      activePlayerIndex: 0,
      players: [],
      physicsInterval: null,

      broadcast: (data) => {
        const message = JSON.stringify(data);
        for (const p of room.players) {
          if (p.ws && p.ws.readyState === 1) { // WebSocket.OPEN
            p.ws.send(message);
          }
        }
      }
    };

    const hostPlayer = {
      id: Math.random().toString(36).substring(2, 9),
      name: hostPlayerName || "Player 1",
      color: PLAYER_COLORS[0],
      ws: ws,
      isHost: true,
      score: 0,
      strokes: 0,
      holeScores: [], // array of strokes per hole
      sunk: false,
      lastSafeX: 0,
      lastSafeY: 0,
      ball: { x: 0, y: 0, vx: 0, vy: 0, active: true }
    };

    room.players.push(hostPlayer);
    this.rooms.set(roomId, room);
    return { room, player: hostPlayer };
  }

  joinRoom(roomId, playerName, ws) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: "Room not found" };
    if (room.status !== "lobby") return { error: "Game already in progress" };
    if (room.players.length >= 7) return { error: "Room is full (max 7 players)" };

    // Check if name is taken
    const colorIndex = room.players.length;
    const player = {
      id: Math.random().toString(36).substring(2, 9),
      name: playerName || `Player ${colorIndex + 1}`,
      color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length],
      ws: ws,
      isHost: false,
      score: 0,
      strokes: 0,
      holeScores: [],
      sunk: false,
      lastSafeX: 0,
      lastSafeY: 0,
      ball: { x: 0, y: 0, vx: 0, vy: 0, active: true }
    };

    room.players.push(player);
    room.lastActivity = Date.now();
    return { room, player };
  }

  startGame(roomId, hostId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: "Room not found" };
    const player = room.players.find(p => p.id === hostId);
    if (!player || !player.isHost) return { error: "Only host can start the game" };
    if (room.players.length < 1) return { error: "Not enough players" };

    room.status = "playing";
    room.currentCourseIndex = 0;
    this.loadCourse(room, 0);

    // Start physics loop at 60 FPS (16.6ms)
    this.startPhysicsLoop(room);
    return { success: true, room };
  }

  loadCourse(room, courseIndex) {
    if (courseIndex >= COURSES.length) {
      room.status = "finished";
      room.broadcast({ type: "GAME_OVER", players: room.players });
      return;
    }

    room.currentCourseIndex = courseIndex;
    room.currentCourse = COURSES[courseIndex];
    room.activePlayerIndex = 0;

    // Reset all players for the new hole
    for (const p of room.players) {
      p.strokes = 0;
      p.sunk = false;
      p.lastSafeX = room.currentCourse.tee.x;
      p.lastSafeY = room.currentCourse.tee.y;
      p.ball = {
        x: room.currentCourse.tee.x + (Math.random() * 10 - 5),
        y: room.currentCourse.tee.y + (Math.random() * 10 - 5),
        vx: 0,
        vy: 0,
        active: true
      };
    }
  }

  startPhysicsLoop(room) {
    if (room.physicsInterval) clearInterval(room.physicsInterval);

    room.physicsInterval = setInterval(() => {
      room.lastActivity = Date.now();
      if (room.status !== "playing") return;

      // Call room event hooks for physics engine
      room.onWaterHazard = (player) => {
        room.broadcast({
          type: "HAZARD_HIT",
          playerId: player.id,
          hazardType: "water",
          strokes: player.strokes
        });
      };

      room.onBallSunk = (player) => {
        room.broadcast({
          type: "BALL_SUNK",
          playerId: player.id
        });
        this.checkHoleProgress(room);
      };

      const isMoving = this.physics.updateRoom(room);

      // Broadcast positions if balls are moving or periodically
      if (isMoving) {
        room.broadcast({
          type: "PHYSICS_UPDATE",
          balls: room.players.map(p => ({
            id: p.id,
            x: p.ball.x,
            y: p.ball.y,
            vx: p.ball.vx,
            vy: p.ball.vy,
            active: p.ball.active,
            sunk: p.sunk
          }))
        });
      }
    }, 1000 / 60);
  }

  shootBall(roomId, playerId, angle, power) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "playing") return { error: "Invalid room or game not active" };

    const activePlayer = room.players[room.activePlayerIndex];
    if (!activePlayer || activePlayer.id !== playerId) {
      return { error: "Not your turn" };
    }

    const ball = activePlayer.ball;
    if (!ball.active || ball.vx !== 0 || ball.vy !== 0) {
      return { error: "Ball is already moving or sunk" };
    }

    // Clamp power (max power e.g. 20)
    const clampedPower = Math.min(Math.max(power, 1), 25);
    
    // Set safe position before shooting
    activePlayer.lastSafeX = ball.x;
    activePlayer.lastSafeY = ball.y;

    // Apply impulse velocity
    ball.vx = Math.cos(angle) * clampedPower;
    ball.vy = Math.sin(angle) * clampedPower;
    activePlayer.strokes += 1;
    activePlayer.score += 1;

    room.lastActivity = Date.now();

    // Broadcast shot action
    room.broadcast({
      type: "PLAYER_SHOOT",
      playerId: activePlayer.id,
      angle: angle,
      power: clampedPower,
      strokes: activePlayer.strokes,
      totalScore: activePlayer.score
    });

    // After shot completes and balls stop, advance turn
    this.monitorShotCompletion(room);

    return { success: true };
  }

  monitorShotCompletion(room) {
    if (room.shotMonitorTimer) return;

    room.shotMonitorTimer = setInterval(() => {
      // Check if any ball is still moving
      let anyMoving = false;
      for (const p of room.players) {
        if (p.ball && p.ball.active && (Math.abs(p.ball.vx) > 0.01 || Math.abs(p.ball.vy) > 0.01)) {
          anyMoving = true;
          break;
        }
      }

      if (!anyMoving) {
        clearInterval(room.shotMonitorTimer);
        room.shotMonitorTimer = null;
        this.advanceTurn(room);
      }
    }, 200);
  }

  advanceTurn(room) {
    if (room.status !== "playing") return;

    // Check if current player sunk their ball
    const currentPlayer = room.players[room.activePlayerIndex];
    if (currentPlayer && currentPlayer.sunk) {
      // Current player already finished this hole, find next unsunk player
    } else {
      // Move to next player who hasn't sunk
      let attempts = 0;
      do {
        room.activePlayerIndex = (room.activePlayerIndex + 1) % room.players.length;
        attempts++;
      } while (room.players[room.activePlayerIndex].sunk && attempts < room.players.length);
    }

    // Check if ALL players have sunk their balls for this hole
    const allSunk = room.players.every(p => p.sunk);
    if (allSunk) {
      // Save hole scores
      for (const p of room.players) {
        p.holeScores.push(p.strokes);
      }

      // Next course
      setTimeout(() => {
        const nextIndex = room.currentCourseIndex + 1;
        if (nextIndex >= COURSES.length) {
          room.status = "finished";
          room.broadcast({
            type: "GAME_FINISHED",
            players: room.players
          });
          if (room.physicsInterval) clearInterval(room.physicsInterval);
        } else {
          this.loadCourse(room, nextIndex);
          room.broadcast({
            type: "NEXT_HOLE",
            courseIndex: nextIndex,
            course: room.currentCourse,
            players: room.players
          });
        }
      }, 2000);
      return;
    }

    // If next player is already sunk, skip again
    while (room.players[room.activePlayerIndex].sunk) {
      room.activePlayerIndex = (room.activePlayerIndex + 1) % room.players.length;
    }

    // Broadcast turn update
    room.broadcast({
      type: "TURN_UPDATE",
      activePlayerId: room.players[room.activePlayerIndex].id,
      activePlayerName: room.players[room.activePlayerIndex].name
    });
  }

  checkHoleProgress(room) {
    const allSunk = room.players.every(p => p.sunk);
    if (allSunk && room.status === "playing") {
      // Triggered via monitorShotCompletion or ball sunk
    }
  }

  removePlayer(ws) {
    for (const [roomId, room] of this.rooms.entries()) {
      const index = room.players.findIndex(p => p.ws === ws);
      if (index !== -1) {
        const removed = room.players.splice(index, 1)[0];
        
        if (room.players.length === 0) {
          this.destroyRoom(roomId);
        } else {
          // If host left, assign new host
          if (removed.isHost && room.players.length > 0) {
            room.players[0].isHost = true;
          }
          // If active player left, advance turn
          if (room.status === "playing" && room.activePlayerIndex >= room.players.length) {
            room.activePlayerIndex = 0;
          }
          room.broadcast({
            type: "PLAYER_LEFT",
            playerId: removed.id,
            players: room.players
          });
        }
        break;
      }
    }
  }

  destroyRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      if (room.physicsInterval) clearInterval(room.physicsInterval);
      if (room.shotMonitorTimer) clearInterval(room.shotMonitorTimer);
      this.rooms.delete(roomId);
    }
  }

  cleanupInactiveRooms() {
    const now = Date.now();
    const timeout = 60 * 60 * 1000; // 1 hour inactivity
    for (const [roomId, room] of this.rooms.entries()) {
      if (now - room.lastActivity > timeout) {
        this.destroyRoom(roomId);
      }
    }
  }
}

module.exports = { RoomManager };
