/**
 * Server-authoritative 2D Physics Engine for Mini-Golf
 * Handles ball movement, velocity damping (friction), wall collisions with restitution,
 * circular bumper collisions, ball-to-ball elastic collisions, hazard interactions (sand/water),
 * and hole detection.
 */

class PhysicsEngine {
  constructor() {
    this.friction = 0.985; // Standard turf friction damping per tick
    this.stopThreshold = 0.02; // Velocity magnitude below which ball stops
    this.ballRadius = 12;
    this.subSteps = 4; // Sub-stepping for ultra-stable collision without tunneling
  }

  /**
   * Update all balls in a game room for a single physics tick (e.g. 60 FPS / 16.6ms)
   * @param {Object} room - The game room state
   * @returns {Boolean} - Returns true if any ball is still moving
   */
  updateRoom(room) {
    let anyMoving = false;
    const course = room.currentCourse;
    if (!course) return false;

    // Apply friction once per full tick
    for (const player of room.players) {
      if (player.finished || player.sunk) continue;
      const ball = player.ball;
      if (!ball || !ball.active) continue;

      const speedSqr = ball.vx * ball.vx + ball.vy * ball.vy;
      if (speedSqr > 0.0001) {
        anyMoving = true;

        let currentFriction = this.friction;
        if (course.hazards) {
          for (const hazard of course.hazards) {
            if (hazard.type === 'sand' &&
                ball.x >= hazard.x && ball.x <= hazard.x + hazard.width &&
                ball.y >= hazard.y && ball.y <= hazard.y + hazard.height) {
              currentFriction = Math.pow(this.friction, hazard.frictionMultiplier || 3.0);
            }
          }
        }

        ball.vx *= currentFriction;
        ball.vy *= currentFriction;

        if (ball.vx * ball.vx + ball.vy * ball.vy < this.stopThreshold * this.stopThreshold) {
          ball.vx = 0;
          ball.vy = 0;
        }
      }
    }

    if (!anyMoving) return false;

    // Perform sub-steps for smooth integration and collision resolution
    const dt = 1.0 / this.subSteps;
    for (let step = 0; step < this.subSteps; step++) {
      for (const player of room.players) {
        if (player.finished || player.sunk) continue;
        const ball = player.ball;
        if (!ball || !ball.active) continue;

        if (ball.vx !== 0 || ball.vy !== 0) {
          const prevX = ball.x;
          const prevY = ball.y;

          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;

          // Wall collisions
          this.resolveWallCollisions(ball, course.walls, prevX, prevY);

          // Bumper collisions
          if (course.bumpers) {
            this.resolveBumperCollisions(ball, course.bumpers);
          }

          // Water hazard
          if (course.hazards) {
            for (const hazard of course.hazards) {
              if (hazard.type === 'water' &&
                  ball.x >= hazard.x && ball.x <= hazard.x + hazard.width &&
                  ball.y >= hazard.y && ball.y <= hazard.y + hazard.height) {
                ball.x = player.lastSafeX;
                ball.y = player.lastSafeY;
                ball.vx = 0;
                ball.vy = 0;
                player.strokes += 1;
                if (room.onWaterHazard) room.onWaterHazard(player);
              }
            }
          }

          // Hole sinking
          if (course.hole) {
            const dx = ball.x - course.hole.x;
            const dy = ball.y - course.hole.y;
            const distSqr = dx * dx + dy * dy;
            const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
            
            if (distSqr <= course.hole.radius * course.hole.radius && currentSpeed < 6.0) {
              ball.x = course.hole.x;
              ball.y = course.hole.y;
              ball.vx = 0;
              ball.vy = 0;
              ball.active = false;
              player.sunk = true;
              if (room.onBallSunk) room.onBallSunk(player);
            }
          }
        }
      }

      // Ball-to-ball collisions
      const activePlayers = room.players.filter(p => p.ball && p.ball.active);
      for (let i = 0; i < activePlayers.length; i++) {
        for (let j = i + 1; j < activePlayers.length; j++) {
          this.resolveBallCollision(activePlayers[i].ball, activePlayers[j].ball);
        }
      }
    }

    return true;
  }

  /**
   * Resolve wall collisions against line segments
   */
  resolveWallCollisions(ball, walls, prevX, prevY) {
    if (!walls) return;
    const r = this.ballRadius;

    for (const wall of walls) {
      const x1 = wall.x1, y1 = wall.y1;
      const x2 = wall.x2, y2 = wall.y2;
      const bounce = wall.bounce !== undefined ? wall.bounce : 0.8;

      const wx = x2 - x1;
      const wy = y2 - y1;
      const lenSqr = wx * wx + wy * wy;
      if (lenSqr === 0) continue;

      let t = ((ball.x - x1) * wx + (ball.y - y1) * wy) / lenSqr;
      t = Math.max(0, Math.min(1, t));

      const cx = x1 + t * wx;
      const cy = y1 + t * wy;

      let dx = ball.x - cx;
      let dy = ball.y - cy;
      let dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < r) {
        let nx, ny;
        if (dist > 0.001) {
          nx = dx / dist;
          ny = dy / dist;
        } else {
          // If perfectly on line, pick normal based on previous position
          const side = (prevX - x1) * wy - (prevY - y1) * wx;
          const len = Math.sqrt(lenSqr);
          nx = side >= 0 ? -wy / len : wy / len;
          ny = side >= 0 ? wx / len : -wx / len;
        }

        // Push ball out
        ball.x = cx + nx * (r + 0.1);
        ball.y = cy + ny * (r + 0.1);

        // Reflect velocity: v' = v - (1 + e)(v . n)n
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) {
          ball.vx -= (1 + bounce) * dot * nx;
          ball.vy -= (1 + bounce) * dot * ny;
        }
      }
    }
  }

  /**
   * Resolve circular bumper collisions
   */
  resolveBumperCollisions(ball, bumpers) {
    const r = this.ballRadius;

    for (const bumper of bumpers) {
      const dx = ball.x - bumper.x;
      const dy = ball.y - bumper.y;
      const minDist = r + bumper.radius;
      const distSqr = dx * dx + dy * dy;

      if (distSqr < minDist * minDist) {
        const dist = Math.sqrt(distSqr);
        let nx = 1, ny = 0;
        if (dist > 0.001) {
          nx = dx / dist;
          ny = dy / dist;
        }

        const bounce = bumper.bounce || 1.3;

        // Push ball out
        ball.x = bumper.x + nx * (minDist + 0.1);
        ball.y = bumper.y + ny * (minDist + 0.1);

        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) {
          ball.vx -= (1 + bounce) * dot * nx;
          ball.vy -= (1 + bounce) * dot * ny;
        }
      }
    }
  }

  /**
   * Resolve elastic collision between two balls
   */
  resolveBallCollision(b1, b2) {
    const dx = b2.x - b1.x;
    const dy = b2.y - b1.y;
    const minDist = this.ballRadius * 2;
    const distSqr = dx * dx + dy * dy;

    if (distSqr < minDist * minDist) {
      const dist = Math.sqrt(distSqr);
      let nx = 1, ny = 0;
      if (dist > 0.001) {
        nx = dx / dist;
        ny = dy / dist;
      }

      // Separate balls equally
      const overlap = (minDist - dist + 0.1) / 2;
      b1.x -= nx * overlap;
      b1.y -= ny * overlap;
      b2.x += nx * overlap;
      b2.y += ny * overlap;

      // Relative velocity
      const rvx = b2.vx - b1.vx;
      const rvy = b2.vy - b1.vy;
      const velAlongNormal = rvx * nx + rvy * ny;

      if (velAlongNormal < 0) {
        const restitution = 0.85;
        const impulseScalar = -(1 + restitution) * velAlongNormal / 2;

        b1.vx -= impulseScalar * nx;
        b1.vy -= impulseScalar * ny;
        b2.vx += impulseScalar * nx;
        b2.vy += impulseScalar * ny;
      }
    }
  }
}

module.exports = { PhysicsEngine };
