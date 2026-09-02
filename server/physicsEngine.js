/**
 * Server-authoritative 2D Physics Engine for Mini-Golf
 * Handles ball movement, velocity damping (friction), wall collisions with restitution,
 * ball-to-ball elastic collisions, hazard interactions (sand/water), hole magnetism,
 * and hole detection.
 */

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Standard ray-casting point-in-polygon test (used for irregular sand bunker shapes)
function pointInPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegmentSquared(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSqr = dx * dx + dy * dy;
  if (lenSqr === 0) {
    const ddx = px - x1, ddy = py - y1;
    return ddx * ddx + ddy * ddy;
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSqr;
  t = clamp(t, 0, 1);
  const cx = x1 + t * dx, cy = y1 + t * dy;
  const ddx = px - cx, ddy = py - cy;
  return ddx * ddx + ddy * ddy;
}

// Ball-vs-shape overlap tests use the ball's outer edge (radius) as the collision
// frontier, not just its center point, so hazards trigger right as the ball touches
// them instead of after it has already visually clipped halfway inside.
function circleOverlapsPolygon(cx, cy, radius, points) {
  if (pointInPolygon(cx, cy, points)) return true;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    if (distToSegmentSquared(cx, cy, points[j].x, points[j].y, points[i].x, points[i].y) <= radius * radius) {
      return true;
    }
  }
  return false;
}

function circleOverlapsRect(cx, cy, radius, rx, ry, rw, rh) {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX, dy = cy - closestY;
  return (dx * dx + dy * dy) <= radius * radius;
}

class PhysicsEngine {
  constructor() {
    this.friction = 0.985; // Standard turf friction damping per tick
    this.stopThreshold = 0.02; // Velocity magnitude below which ball stops
    this.ballRadius = 12;
    this.subSteps = 4; // Sub-stepping for ultra-stable collision without tunneling
    this.collisionDamping = 0.92; // Bounces bleed a little speed instead of staying perfectly elastic
    this.holeAttractionMultiplier = 1.2; // Magnetic pull only reaches just past the rim
    this.holeAttractionStrength = 0.16; // A light nudge, not a snap-in magnet
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
            if (hazard.type === 'sand' && this.isBallInHazard(ball, hazard)) {
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

          // Magnetic hole attraction: a ball passing near the cup gets a light pull
          // toward it, stronger the closer/slower it is (subtle lip-in effect)
          if (course.hole) {
            this.applyHoleAttraction(ball, course.hole);
          }

          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;

          // Wall collisions
          this.resolveWallCollisions(ball, course.walls, prevX, prevY);

          // Water hazard
          if (course.hazards) {
            for (const hazard of course.hazards) {
              if (hazard.type === 'water' && this.isBallInHazard(ball, hazard)) {
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
   * Whether the ball's outer edge overlaps a hazard shape (polygon-based sand
   * bunkers, or axis-aligned water rectangles).
   */
  isBallInHazard(ball, hazard) {
    if (hazard.points) {
      return circleOverlapsPolygon(ball.x, ball.y, this.ballRadius, hazard.points);
    }
    return circleOverlapsRect(ball.x, ball.y, this.ballRadius, hazard.x, hazard.y, hazard.width, hazard.height);
  }

  /**
   * Apply a light magnetic pull toward the hole when the ball passes just past the
   * rim, so shots that skim the cup have a small chance to curve in.
   */
  applyHoleAttraction(ball, hole) {
    const attractRadius = hole.radius * this.holeAttractionMultiplier;
    const dx = hole.x - ball.x;
    const dy = hole.y - ball.y;
    const distSqr = dx * dx + dy * dy;
    if (distSqr > attractRadius * attractRadius) return;

    const dist = Math.sqrt(distSqr);
    if (dist < 0.5) return;

    // Fast-moving balls resist the pull so a hard shot isn't yanked off course;
    // slow, rolling balls near the lip get the (still light) attraction.
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    const speedFactor = Math.max(0.1, 1 - speed / 14);
    const proximityFactor = 1 - dist / attractRadius;
    const strength = this.holeAttractionStrength * proximityFactor * proximityFactor * speedFactor;

    ball.vx += (dx / dist) * strength;
    ball.vy += (dy / dist) * strength;
  }

  /**
   * Resolve wall collisions against line segments. The ball's radius (its outer
   * edge, not its center) is the collision frontier used for both detection and
   * push-out, so the ball never visually sinks into a wall before bouncing.
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

        // Push ball out so its outer edge, not its center, rests at the wall
        ball.x = cx + nx * (r + 0.1);
        ball.y = cy + ny * (r + 0.1);

        // Reflect velocity: v' = v - (1 + e)(v . n)n, then bleed a little speed
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) {
          ball.vx -= (1 + bounce) * dot * nx;
          ball.vy -= (1 + bounce) * dot * ny;
          ball.vx *= this.collisionDamping;
          ball.vy *= this.collisionDamping;
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

        b1.vx *= this.collisionDamping;
        b1.vy *= this.collisionDamping;
        b2.vx *= this.collisionDamping;
        b2.vy *= this.collisionDamping;
      }
    }
  }
}

module.exports = { PhysicsEngine };
