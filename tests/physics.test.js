/**
 * Automated Test Suite for Physics Engine & Room Manager
 */

const assert = require('assert');
const { PhysicsEngine } = require('../server/physicsEngine');
const { RoomManager } = require('../server/roomManager');
const { COURSES } = require('../server/courses');

console.log('--- RUNNING TEST SUITE ---');

// Test 1: Courses
console.log('Test 1: Verify Course Definitions');
assert(COURSES.length >= 3, 'Should have at least 3 courses');
for (const course of COURSES) {
  assert(course.tee, `Course ${course.name} must have a tee`);
  assert(course.hole, `Course ${course.name} must have a hole`);
  assert(course.walls.length > 0, `Course ${course.name} must have walls`);
}
console.log('✓ Course definitions valid');

// Test 2: Physics Engine - Friction & Movement
console.log('Test 2: Physics Movement & Friction');
const physics = new PhysicsEngine();
const mockRoom = {
  currentCourse: COURSES[0],
  players: [
    {
      id: 'p1',
      strokes: 0,
      sunk: false,
      ball: { x: 100, y: 100, vx: 5, vy: 0, active: true },
      lastSafeX: 100,
      lastSafeY: 100
    }
  ]
};

const moving = physics.updateRoom(mockRoom);
assert(moving, 'Ball should be moving');
assert(mockRoom.players[0].ball.x > 100, 'Ball position X should increase');
assert(mockRoom.players[0].ball.vx < 5, 'Ball velocity should be damped by friction');
console.log('✓ Ball movement and friction working');

// Test 3: Physics Engine - Wall Bounce
console.log('Test 3: Wall Collision & Restitution');
const wallRoom = {
  currentCourse: {
    walls: [{ x1: 200, y1: 0, x2: 200, y2: 400, bounce: 0.8 }],
    hole: { x: 999, y: 999, radius: 10 }
  },
  players: [
    {
      id: 'p1',
      sunk: false,
      ball: { x: 195, y: 100, vx: 10, vy: 0, active: true },
      lastSafeX: 100,
      lastSafeY: 100
    }
  ]
};
physics.updateRoom(wallRoom);
assert(wallRoom.players[0].ball.vx < 0, 'Ball velocity should reflect off the wall (vx < 0)');
console.log('✓ Wall collision and reflection working');

// Test 4: Physics Engine - Ball-Ball Collision
console.log('Test 4: Ball-Ball Elastic Collision');
const ballBallRoom = {
  currentCourse: {
    walls: [],
    hole: { x: 999, y: 999, radius: 10 }
  },
  players: [
    {
      id: 'p1',
      sunk: false,
      ball: { x: 100, y: 100, vx: 10, vy: 0, active: true }
    },
    {
      id: 'p2',
      sunk: false,
      ball: { x: 115, y: 100, vx: 0, vy: 0, active: true }
    }
  ]
};
physics.updateRoom(ballBallRoom);
assert(ballBallRoom.players[1].ball.vx > 0, 'Second ball should gain forward momentum from collision');
assert(ballBallRoom.players[0].ball.vx < 10, 'First ball should lose momentum');
console.log('✓ Ball-to-ball collision dynamics working');

// Test 5: Physics Engine - Hole Sinking
console.log('Test 5: Hole Sinking Capture');
let sunkCalled = false;
const holeRoom = {
  currentCourse: {
    walls: [],
    hole: { x: 200, y: 200, radius: 15 }
  },
  onBallSunk: () => { sunkCalled = true; },
  players: [
    {
      id: 'p1',
      sunk: false,
      ball: { x: 202, y: 200, vx: 0.5, vy: 0, active: true }
    }
  ]
};
physics.updateRoom(holeRoom);
assert(holeRoom.players[0].sunk, 'Player should be marked as sunk');
assert(sunkCalled, 'onBallSunk callback should be triggered');
console.log('✓ Hole sink capture working');

// Test 6: Room Manager - Creation & Joining
console.log('Test 6: Room Manager Lobby & Player Limits');
const rm = new RoomManager();
const mockWs = { send: () => {}, readyState: 1 };
const { room, player } = rm.createRoom('Host', mockWs);
assert(room.players.length === 1, 'Room should have 1 player');
assert(player.isHost, 'First player should be host');

// Join up to 7 players
for (let i = 2; i <= 7; i++) {
  const res = rm.joinRoom(room.id, `Player ${i}`, mockWs);
  assert(!res.error, `Player ${i} should be able to join`);
}
assert(room.players.length === 7, 'Room should have 7 players');

// 8th player should be rejected
const overLimit = rm.joinRoom(room.id, 'Player 8', mockWs);
assert(overLimit.error, '8th player should be rejected (max 7)');
console.log('✓ Lobby player limits and joining verified');

// Test 7: Game Start & Turn Progression
console.log('Test 7: Game Start & Shoot Action');
const startRes = rm.startGame(room.id, player.id);
assert(startRes.success, 'Game should start successfully');
assert(room.status === 'playing', 'Room status should be playing');

const shootRes = rm.shootBall(room.id, player.id, 0, 10);
assert(shootRes.success, 'Host player should be able to shoot on their turn');
assert(player.strokes === 1, 'Player strokes should increase to 1');
assert(player.score === 1, 'Player total score should increase to 1');
console.log('✓ Turn-based shooting action verified');

// Cleanup
rm.destroyRoom(room.id);
assert(!rm.rooms.has(room.id), 'Room should be destroyed cleanly');
console.log('✓ Room cleanup verified');

console.log('\n========================================');
console.log('ALL TESTS PASSED SUCCESSFULLY! 🎉');
console.log('========================================\n');
process.exit(0);
