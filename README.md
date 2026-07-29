# Old West Frontier

A persistent, multiplayer old-west homestead sim, meant to run as a
Discord Activity. Walk a shared map, gather wood and stone, claim a
homestead plot, build structures on it, farm crops, and barter goods
directly with other players — no money anywhere, pure trade.

## What's actually working right now

- **Shared live map** (20x20) — every player moves on the same world,
  in real time, over sockets. You see other players walking around.
- **Gathering** — trees (wood) and rocks (stone) scattered around the
  map, walk up and gather, each node has a respawn cooldown.
- **Homesteading** — 6 fixed 3x3 plots on the map. Walk onto an
  unclaimed one and claim it (free).
- **Building** — on your own plot, build a Cabin, Barn, Fence, or Well,
  each costing wood/stone.
- **Farming** — plant wheat/corn/potato on your own plot's open tiles,
  wait for it to grow, harvest for goods (free to plant, just takes
  time and land).
- **Barter trading** — walk next to another player, send a trade
  request, both sides offer goods from inventory, both confirm, and
  the swap happens atomically server-side. No currency at all.
- Dev username login (stand-in for real Discord identity) and full
  Discord Activity OAuth wiring, same pattern as before.

## What's NOT here yet

- Real hand-drawn art (current visuals are emoji icons on a colored
  grid — a real visual pass is a separate next step)
- More building types, crop varieties, or resource types
- Any progression/skill system
- Persistent database (still SQLite on Render's free tier, which
  resets on every redeploy — worth fixing before showing this to
  other people for real)

## Running it locally

Requires Node.js 18+.

**Terminal 1 — server:**
```bash
cd server
npm install
npm run dev
```

**Terminal 2 — client:**
```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173`. Move with arrow keys or WASD. Open a
second browser profile/incognito window with a different username to
test movement sync and trading between two players.

## Deploying

Same as before: push to GitHub, connect to Render (or similar), set
`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and
`VITE_DISCORD_CLIENT_ID` as environment variables, deploy. `render.yaml`
is included as a blueprint.
