# ⛳ Mini-Golf 2D Multiplayer

An ultra-lightweight, high-performance multiplayer 2D mini-golf web application designed for self-hosting on personal servers (Proxmox LXC, Docker, Portainer) with a minimal resource footprint (~30 MB RAM).

---

## 🚀 Key Features

- **100% Web-Based**: Zero installation or download required for players. Plays directly in Chrome and Safari on desktop and mobile.
- **Server-Authoritative Physics**: Pure JavaScript 2D physics engine handling turf friction, wall bounces, circular pinball bumpers, ball-to-ball elastic collisions, sand traps, water hazards, and hole capture.
- **Turn-Based Multiplayer**: Up to 7 players per room. Real-time spectator view while the active player lines up and shoots.
- **Live Scoreboard**: Persistent real-time stroke tracking and total scores for all connected players.
- **Zero Heavy Frameworks**: Pure Node.js with the lightweight `ws` WebSocket library on the backend, and Vanilla HTML5 Canvas 2D + Web Audio API synthesizer on the frontend.
- **Password Protection**: Simple entry gate configurable via environment variable.

---

## 📁 Project Architecture

```
mini-golf/
├── server/
│   ├── index.js          # HTTP static server & WebSocket server + password auth
│   ├── roomManager.js    # Lobby management, turn logic, room timeouts & cleanup
│   ├── physicsEngine.js  # Server-authoritative 2D physics (friction, collisions, hazards)
│   └── courses.js        # Multi-hole course layout definitions (walls, bumpers, holes)
├── public/
│   ├── index.html        # UI shell (Login, Lobby, Game Canvas, Scoreboard)
│   ├── style.css         # Clean, modern, responsive CSS styling
│   └── client.js         # Canvas 2D rendering, aim/shoot controls, Web Audio SFX
├── tests/
│   └── physics.test.js   # Automated test suite for physics & room mechanics
├── Dockerfile            # Optimized multi-arch Node 20 Alpine image
├── docker-compose.yml    # Docker Compose deployment configuration
└── README.md
```

---

## 🛠️ Local Development & Testing

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run automated tests**:
   ```bash
   npm test
   ```

3. **Start the development server**:
   ```bash
   npm start
   ```
   Open `http://localhost:3000` in your browser.

---

## 📦 Deployment Guides

### 1. Docker / Docker Compose (Recommended)

1. Clone or copy the repository onto your host.
2. Edit [`docker-compose.yml`](docker-compose.yml:1) to set your desired password (`APP_PASSWORD`).
3. Run:
   ```bash
   docker compose up -d --build
   ```
4. Access via `http://<server-ip>:3000`.

### 2. Portainer Deployment

1. Open your Portainer dashboard.
2. Go to **Stacks** -> **Add stack**.
3. Paste the contents of [`docker-compose.yml`](docker-compose.yml:1) or upload the repository.
4. Configure environment variables (`PORT`, `APP_PASSWORD`).
5. Click **Deploy the stack**.

### 3. Proxmox LXC Deployment

1. Create a lightweight LXC container in Proxmox (e.g. Debian 12 or Ubuntu Alpine, allocating 512 MB to 1 GB RAM).
2. Install Docker and Docker Compose inside the LXC container:
   ```bash
   apt update && apt install -y curl docker.io docker-compose-v2
   ```
3. Clone the mini-golf repository and run:
   ```bash
   docker compose up -d --build
   ```
4. Set up port forwarding on your router/firewall if accessing from outside your local network.

---

## ⚙️ Environment Variables

- `PORT`: Port number for the HTTP/WebSocket server (default: `3000`).
- `APP_PASSWORD`: Password required to enter the application (leave empty `""` for public open access).

---

## 📝 Customization

- **Add New Holes**: Edit [`server/courses.js`](server/courses.js:1) to add new course objects with custom walls, bumpers, sand traps, and water hazards.
- **Adjust Physics**: Tune friction, restitution, and bounce multipliers in [`server/physicsEngine.js`](server/physicsEngine.js:1).
