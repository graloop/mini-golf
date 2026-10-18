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
   APP_PASSWORD=dev-password-1234567 npm start
   ```
   Open `http://localhost:3000` in your browser.

---

## 📦 Deployment (golf.graloop.com behind nginx)

The app is meant to run **only behind nginx**: the container listens on `127.0.0.1:3000`, and nginx terminates TLS for `golf.graloop.com` and proxies to it. Do **not** port-forward 3000 on your router. Forward only **80** and **443** to the nginx host.

1. **DNS**: create an `A` (and `AAAA` if you use IPv6) record for `golf.graloop.com` pointing at your public IP.
2. **Secret**: on the server, in the repo folder:
   ```bash
   cp .env.example .env
   sed -i "s|^APP_PASSWORD=.*|APP_PASSWORD=$(openssl rand -base64 24)|" .env
   chmod 600 .env
   ```
3. **Start the app**:
   ```bash
   docker compose up -d --build
   curl -s http://127.0.0.1:3000/healthz   # -> ok
   ```
4. **Certificate**: `sudo certbot certonly --nginx -d golf.graloop.com`
5. **nginx site**:
   ```bash
   sudo cp deploy/nginx/golf.graloop.com.conf /etc/nginx/sites-available/
   sudo ln -s /etc/nginx/sites-available/golf.graloop.com.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
6. Open `https://golf.graloop.com` and share the password with your players.

### Security model

- The shared password is compared in constant time. After 5 wrong attempts the socket closes, and after 10 failures in 15 minutes the client IP is locked out for 15 minutes.
- WebSocket connections are accepted only from `ALLOWED_ORIGINS`. Each IP is limited to 10 connections (200 in total) and 20 messages per second. Unauthenticated sockets are closed after 30 seconds, and dead sockets are reaped with pings.
- At most 100 rooms can exist at once. Clients only ever receive public player fields.
- Strict CSP and security headers come from the app; HSTS, rate limiting and request-size limits come from nginx.
- The container runs read-only and non-root, with no Linux capabilities, `no-new-privileges`, and memory, CPU and PID limits.

---

## ⚙️ Environment Variables

- `APP_PASSWORD` (required, min 16 chars): shared password to enter the game. Keep it in `.env`.
- `PORT`: listen port (default `3000`).
- `HOST`: bind address (default `127.0.0.1`; the Docker image sets `0.0.0.0` inside the container).
- `TRUST_PROXY`: `true` to take the client IP from nginx's `X-Real-IP`. Enable only when the app is reachable exclusively through nginx.
- `ALLOWED_ORIGINS`: comma-separated origins allowed to open WebSockets (e.g. `https://golf.graloop.com`).
- `MAX_CONNECTIONS`, `MAX_CONNECTIONS_PER_IP`, `MAX_ROOMS`: abuse limits (defaults 200 / 10 / 100).

---

## 📝 Customization

- **Add New Holes**: Edit [`server/courses.js`](server/courses.js:1) to add new course objects with custom walls, bumpers, sand traps, and water hazards.
- **Adjust Physics**: Tune friction, restitution, and bounce multipliers in [`server/physicsEngine.js`](server/physicsEngine.js:1).
