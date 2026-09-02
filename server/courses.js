/**
 * Mini-Golf Course Definitions
 * Coordinates are based on a fixed 1000x600 virtual resolution.
 * Scaled gracefully on the client canvas.
 */

const COURSES = [
  {
    id: 1,
    name: "Hole 1: The Gentle Dogleg",
    par: 2,
    width: 1000,
    height: 600,
    tee: { x: 120, y: 300, radius: 24 },
    hole: { x: 880, y: 180, radius: 15 },
    walls: [
      // Outer boundaries
      { x1: 50, y1: 50, x2: 950, y2: 50 },
      { x1: 950, y1: 50, x2: 950, y2: 550 },
      { x1: 950, y1: 550, x2: 50, y2: 550 },
      { x1: 50, y1: 550, x2: 50, y2: 50 },
      // Inner divider wall creating dogleg
      { x1: 450, y1: 50, x2: 450, y2: 380, bounce: 0.85 },
      { x1: 650, y1: 220, x2: 650, y2: 550, bounce: 0.85 }
    ],
    bumpers: [
      { x: 450, y: 380, radius: 22, bounce: 1.3, color: "#f59e0b" },
      { x: 650, y: 220, radius: 22, bounce: 1.3, color: "#f59e0b" },
      { x: 800, y: 400, radius: 18, bounce: 1.2, color: "#3b82f6" }
    ],
    hazards: [
      { type: "sand", x: 700, y: 80, width: 120, height: 100, frictionMultiplier: 3.5 }
    ]
  },
  {
    id: 2,
    name: "Hole 2: Pinball Bumper Alley",
    par: 3,
    width: 1000,
    height: 600,
    tee: { x: 100, y: 300, radius: 24 },
    hole: { x: 900, y: 300, radius: 15 },
    walls: [
      // Outer border
      { x1: 50, y1: 80, x2: 950, y2: 80 },
      { x1: 950, y1: 80, x2: 950, y2: 520 },
      { x1: 950, y1: 520, x2: 50, y2: 520 },
      { x1: 50, y1: 520, x2: 50, y2: 80 },
      // Funnel near the hole
      { x1: 750, y1: 80, x2: 820, y2: 230 },
      { x1: 750, y1: 520, x2: 820, y2: 370 }
    ],
    bumpers: [
      // Dynamic cluster of high-bounce pinball bumpers
      { x: 300, y: 200, radius: 26, bounce: 1.45, color: "#ef4444" },
      { x: 300, y: 400, radius: 26, bounce: 1.45, color: "#ef4444" },
      { x: 450, y: 300, radius: 30, bounce: 1.5, color: "#eab308" },
      { x: 600, y: 190, radius: 26, bounce: 1.45, color: "#3b82f6" },
      { x: 600, y: 410, radius: 26, bounce: 1.45, color: "#3b82f6" }
    ],
    hazards: [
      { type: "sand", x: 400, y: 100, width: 100, height: 80, frictionMultiplier: 3.5 },
      { type: "sand", x: 400, y: 420, width: 100, height: 80, frictionMultiplier: 3.5 }
    ]
  },
  {
    id: 3,
    name: "Hole 3: The Island Bridge",
    par: 3,
    width: 1000,
    height: 600,
    tee: { x: 120, y: 300, radius: 24 },
    hole: { x: 880, y: 300, radius: 15 },
    walls: [
      { x1: 50, y1: 60, x2: 950, y2: 60 },
      { x1: 950, y1: 60, x2: 950, y2: 540 },
      { x1: 950, y1: 540, x2: 50, y2: 540 },
      { x1: 50, y1: 540, x2: 50, y2: 60 },
      // Angled entry walls
      { x1: 260, y1: 60, x2: 360, y2: 240 },
      { x1: 260, y1: 540, x2: 360, y2: 360 },
      // Angled exit walls
      { x1: 740, y1: 240, x2: 840, y2: 60 },
      { x1: 740, y1: 360, x2: 840, y2: 540 }
    ],
    bumpers: [
      { x: 550, y: 300, radius: 22, bounce: 1.35, color: "#8b5cf6" },
      { x: 360, y: 240, radius: 16, bounce: 1.2, color: "#10b981" },
      { x: 360, y: 360, radius: 16, bounce: 1.2, color: "#10b981" },
      { x: 740, y: 240, radius: 16, bounce: 1.2, color: "#10b981" },
      { x: 740, y: 360, radius: 16, bounce: 1.2, color: "#10b981" }
    ],
    hazards: [
      // Top and bottom water hazards
      { type: "water", x: 370, y: 60, width: 360, height: 180 },
      { type: "water", x: 370, y: 360, width: 360, height: 180 }
    ]
  },
  {
    id: 4,
    name: "Hole 4: The Zig-Zag Fortress",
    par: 4,
    width: 1000,
    height: 600,
    tee: { x: 120, y: 120, radius: 24 },
    hole: { x: 880, y: 480, radius: 15 },
    walls: [
      { x1: 50, y1: 50, x2: 950, y2: 50 },
      { x1: 950, y1: 50, x2: 950, y2: 550 },
      { x1: 950, y1: 550, x2: 50, y2: 550 },
      { x1: 50, y1: 550, x2: 50, y2: 50 },
      // Zigzag partition 1
      { x1: 50, y1: 200, x2: 700, y2: 200, bounce: 0.85 },
      // Zigzag partition 2
      { x1: 300, y1: 380, x2: 950, y2: 380, bounce: 0.85 },
      // Central deflection diagonal
      { x1: 450, y1: 200, x2: 550, y2: 280, bounce: 1.1 }
    ],
    bumpers: [
      { x: 700, y: 200, radius: 20, bounce: 1.4, color: "#f97316" },
      { x: 300, y: 380, radius: 20, bounce: 1.4, color: "#f97316" },
      { x: 160, y: 460, radius: 24, bounce: 1.3, color: "#06b6d4" },
      { x: 840, y: 120, radius: 24, bounce: 1.3, color: "#06b6d4" }
    ],
    hazards: [
      { type: "sand", x: 500, y: 440, width: 140, height: 80, frictionMultiplier: 3.2 },
      { type: "water", x: 780, y: 220, width: 140, height: 140 }
    ]
  }
];

module.exports = {
  COURSES
};
