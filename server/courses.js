/**
 * Mini-Golf Course Definitions
 * Coordinates are in a per-course virtual resolution (course.width x course.height).
 * The client scales/letterboxes this space to fit its canvas, so holes can be any size.
 *
 * Sand hazards are irregular polygon "blobs" (real bunkers aren't perfect squares) built
 * with sandBlob(); water hazards stay simple rectangles. Both are checked against the
 * ball's outer edge, not just its center, so they never look like they clip into the ball.
 */

// Deterministic irregular blob polygon around (cx, cy) — looks like a natural bunker,
// not a rectangle. `seed` just varies the wobble pattern between bunkers.
function sandBlob(cx, cy, rx, ry, seed = 1, pointCount = 12) {
  const points = [];
  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2;
    const wobble =
      Math.sin(angle * 3 + seed * 7.13) * 0.18 +
      Math.sin(angle * 5 + seed * 2.37) * 0.10;
    const r = 1 + wobble;
    points.push({
      x: Math.round(cx + Math.cos(angle) * rx * r),
      y: Math.round(cy + Math.sin(angle) * ry * r)
    });
  }
  return points;
}

const GREEN_VALLEY_COURSES = [
  {
    id: 1,
    name: "Hole 1: The Gentle Dogleg",
    par: 3,
    width: 1400,
    height: 700,
    tee: { x: 130, y: 350, radius: 24 },
    hole: { x: 1270, y: 190, radius: 15 },
    walls: [
      // Outer boundaries
      { x1: 50, y1: 50, x2: 1350, y2: 50 },
      { x1: 1350, y1: 50, x2: 1350, y2: 650 },
      { x1: 1350, y1: 650, x2: 50, y2: 650 },
      { x1: 50, y1: 650, x2: 50, y2: 50 },
      // Inner divider walls creating a long dogleg
      { x1: 650, y1: 50, x2: 650, y2: 470, bounce: 0.85 },
      { x1: 950, y1: 220, x2: 950, y2: 650, bounce: 0.85 }
    ],
    hazards: [
      { type: "sand", points: sandBlob(1080, 110, 140, 90, 1), frictionMultiplier: 3.4 },
      { type: "water", x: 1130, y: 460, width: 170, height: 140 }
    ]
  },
  {
    id: 2,
    name: "Hole 2: The Narrows",
    par: 4,
    width: 1500,
    height: 700,
    tee: { x: 120, y: 350, radius: 24 },
    hole: { x: 1380, y: 350, radius: 15 },
    walls: [
      // Outer border
      { x1: 50, y1: 60, x2: 1450, y2: 60 },
      { x1: 1450, y1: 60, x2: 1450, y2: 640 },
      { x1: 1450, y1: 640, x2: 50, y2: 640 },
      { x1: 50, y1: 640, x2: 50, y2: 60 },
      // Winding corridor dividers — each leaves a wide (230px) dry gap so the
      // water/sand alongside it is a risk to cut through, never a full blockage
      { x1: 450, y1: 60, x2: 450, y2: 410, bounce: 0.85 },
      { x1: 800, y1: 290, x2: 800, y2: 640, bounce: 0.85 },
      { x1: 1150, y1: 60, x2: 1150, y2: 410, bounce: 0.85 },
      // Funnel near the hole
      { x1: 1250, y1: 60, x2: 1320, y2: 240, bounce: 0.9 },
      { x1: 1250, y1: 640, x2: 1320, y2: 460, bounce: 0.9 }
    ],
    hazards: [
      { type: "water", x: 340, y: 480, width: 220, height: 90 },
      { type: "water", x: 690, y: 130, width: 220, height: 90 },
      { type: "sand", points: sandBlob(1150, 525, 90, 60, 2), frictionMultiplier: 3.3 }
    ]
  },
  {
    id: 3,
    name: "Hole 3: The Island Bridge",
    par: 4,
    width: 1450,
    height: 700,
    tee: { x: 130, y: 350, radius: 24 },
    hole: { x: 1320, y: 350, radius: 15 },
    walls: [
      { x1: 50, y1: 60, x2: 1400, y2: 60 },
      { x1: 1400, y1: 60, x2: 1400, y2: 640 },
      { x1: 1400, y1: 640, x2: 50, y2: 640 },
      { x1: 50, y1: 640, x2: 50, y2: 60 },
      // Angled entry walls onto the bridge
      { x1: 380, y1: 60, x2: 500, y2: 280 },
      { x1: 380, y1: 640, x2: 500, y2: 420 },
      // Angled exit walls off the bridge
      { x1: 950, y1: 280, x2: 1070, y2: 60 },
      { x1: 950, y1: 420, x2: 1070, y2: 640 }
    ],
    hazards: [
      // Top and bottom water hazards flanking the narrow bridge
      { type: "water", x: 500, y: 60, width: 450, height: 220 },
      { type: "water", x: 500, y: 420, width: 450, height: 220 },
      { type: "sand", points: sandBlob(1200, 500, 80, 60, 3), frictionMultiplier: 3.2 }
    ]
  },
  {
    id: 4,
    name: "Hole 4: The Zig-Zag Fortress",
    par: 5,
    width: 1400,
    height: 750,
    tee: { x: 130, y: 130, radius: 24 },
    hole: { x: 1270, y: 620, radius: 15 },
    walls: [
      { x1: 50, y1: 50, x2: 1350, y2: 50 },
      { x1: 1350, y1: 50, x2: 1350, y2: 700 },
      { x1: 1350, y1: 700, x2: 50, y2: 700 },
      { x1: 50, y1: 700, x2: 50, y2: 50 },
      // Zigzag partition 1
      { x1: 50, y1: 250, x2: 1000, y2: 250, bounce: 0.85 },
      // Zigzag partition 2
      { x1: 400, y1: 480, x2: 1350, y2: 480, bounce: 0.85 },
      // Central deflection diagonal
      { x1: 650, y1: 250, x2: 780, y2: 360, bounce: 1.05 }
    ],
    hazards: [
      { type: "sand", points: sandBlob(700, 590, 150, 90, 4), frictionMultiplier: 3.3 },
      { type: "water", x: 1120, y: 280, width: 190, height: 180 }
    ]
  },
  {
    id: 5,
    name: "Hole 5: Serpentine Creek",
    par: 4,
    width: 1500,
    height: 700,
    tee: { x: 120, y: 350, radius: 24 },
    hole: { x: 1380, y: 350, radius: 15 },
    walls: [
      { x1: 50, y1: 60, x2: 1450, y2: 60 },
      { x1: 1450, y1: 60, x2: 1450, y2: 640 },
      { x1: 1450, y1: 640, x2: 50, y2: 640 },
      { x1: 50, y1: 640, x2: 50, y2: 60 },
      // Snaking S-curve walls
      { x1: 350, y1: 60, x2: 350, y2: 430, bounce: 0.85 },
      { x1: 650, y1: 270, x2: 650, y2: 640, bounce: 0.85 },
      { x1: 950, y1: 60, x2: 950, y2: 430, bounce: 0.85 },
      { x1: 1200, y1: 270, x2: 1200, y2: 640, bounce: 0.85 }
    ],
    hazards: [
      // The creek sits in the open middle of each S-curve bend, well clear of
      // both gate exits so there's always a generous dry path around it
      { type: "water", x: 450, y: 350, width: 130, height: 170 },
      { type: "water", x: 1050, y: 350, width: 130, height: 170 },
      { type: "sand", points: sandBlob(1330, 180, 100, 75, 5), frictionMultiplier: 3.3 }
    ]
  },
  {
    id: 6,
    name: "Hole 6: The Funnel",
    par: 3,
    width: 1350,
    height: 700,
    tee: { x: 130, y: 350, radius: 24 },
    hole: { x: 1220, y: 350, radius: 15 },
    walls: [
      { x1: 50, y1: 60, x2: 1300, y2: 60 },
      { x1: 1300, y1: 60, x2: 1300, y2: 640 },
      { x1: 1300, y1: 640, x2: 50, y2: 640 },
      { x1: 50, y1: 640, x2: 50, y2: 60 },
      // Long converging walls funnel the approach toward the green
      { x1: 500, y1: 130, x2: 950, y2: 300, bounce: 0.85 },
      { x1: 500, y1: 570, x2: 950, y2: 400, bounce: 0.85 }
    ],
    hazards: [
      { type: "water", x: 250, y: 420, width: 200, height: 160 },
      { type: "sand", points: sandBlob(1080, 350, 100, 80, 6), frictionMultiplier: 3.5 }
    ]
  },
  {
    id: 7,
    name: "Hole 7: Split Fairway",
    par: 4,
    width: 1450,
    height: 750,
    tee: { x: 130, y: 375, radius: 24 },
    hole: { x: 1320, y: 375, radius: 15 },
    walls: [
      { x1: 50, y1: 60, x2: 1400, y2: 60 },
      { x1: 1400, y1: 60, x2: 1400, y2: 690 },
      { x1: 1400, y1: 690, x2: 50, y2: 690 },
      { x1: 50, y1: 690, x2: 50, y2: 60 },
      // Center divider splitting sand path (top) from water path (bottom)
      { x1: 400, y1: 375, x2: 1050, y2: 375, bounce: 0.85 },
      // Funnel converging both paths back toward the hole
      { x1: 1050, y1: 200, x2: 1180, y2: 375, bounce: 0.9 },
      { x1: 1050, y1: 550, x2: 1180, y2: 375, bounce: 0.9 }
    ],
    hazards: [
      { type: "sand", points: sandBlob(650, 220, 150, 90, 7), frictionMultiplier: 3.4 },
      { type: "water", x: 500, y: 460, width: 400, height: 160 }
    ]
  },
  {
    id: 8,
    name: "Hole 8: The Long Green Mile",
    par: 6,
    width: 1700,
    height: 800,
    tee: { x: 130, y: 400, radius: 24 },
    hole: { x: 1560, y: 400, radius: 15 },
    walls: [
      { x1: 50, y1: 50, x2: 1650, y2: 50 },
      { x1: 1650, y1: 50, x2: 1650, y2: 750 },
      { x1: 1650, y1: 750, x2: 50, y2: 750 },
      { x1: 50, y1: 750, x2: 50, y2: 50 },
      // Four-turn dogleg gauntlet
      { x1: 400, y1: 50, x2: 400, y2: 520, bounce: 0.85 },
      { x1: 700, y1: 280, x2: 700, y2: 750, bounce: 0.85 },
      { x1: 1000, y1: 50, x2: 1000, y2: 520, bounce: 0.85 },
      { x1: 1300, y1: 280, x2: 1300, y2: 750, bounce: 0.85 }
    ],
    hazards: [
      // Water sits in the open middle of each dogleg bend, well clear of both
      // gate exits so there's always a generous dry path around it
      { type: "water", x: 480, y: 350, width: 140, height: 200 },
      { type: "sand", points: sandBlob(850, 160, 130, 85, 8), frictionMultiplier: 3.4 },
      { type: "water", x: 1080, y: 350, width: 140, height: 200 },
      { type: "sand", points: sandBlob(1450, 160, 130, 85, 9), frictionMultiplier: 3.4 }
    ]
  }
];

// A "parcour" is a selectable pack of holes. Green Valley is the original
// course pack; Frost Parcour is a planned future pack (not yet implemented).
const PARCOURS = {
  "green-valley": {
    id: "green-valley",
    name: "Green Valley",
    description: "Classic turf, sand bunkers & water hazards",
    holeCount: GREEN_VALLEY_COURSES.length,
    courses: GREEN_VALLEY_COURSES
  }
};

module.exports = {
  PARCOURS,
  // Backwards-compatible export: default course pack
  COURSES: GREEN_VALLEY_COURSES
};
