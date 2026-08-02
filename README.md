# Extreme Frontier

A single-player, first-person 3D survival game, meant to run as a
Discord Activity. Ten years after a nuclear event — radiation's long
gone, but nothing ever got rebuilt. You're a lone survivor stepping
back out into a quiet, overgrown world to build a life again.

This repo previously held an old-west multiplayer homestead/barter
sim under the same name. That project is paused; this is a fresh
game built on the same Discord Activity shell (auth, server, deploy).

## What's actually working right now

- **First-person 3D world** — Three.js engine: rolling procedurally-
  textured terrain, gatherable trees/rocks/berry bushes, ponds,
  a day/night cycle, PBR materials, post-processing (bloom, filmic
  grade, vignette, grain), and instanced swaying grass.
- **Survival loop** — health, hunger, thirst, stamina, and warmth,
  each with real consequences. Gather wood/stone/fiber/berries,
  hunt wolves for meat, drink from ponds, craft a campfire/spear/
  torch, cook food, survive the night.
- **Wolves** — spawn more at night, chase and attack; craft a spear
  to fight back and harvest meat from kills.
- Dev username login (stand-in for real Discord identity) and full
  Discord Activity OAuth wiring, same pattern as before.
- A simple per-player save endpoint (one JSON blob per player,
  stored in Postgres) — not yet wired up on the client side.

## What's NOT here yet

- Real 3D character models — the player is a floating camera (no
  visible body), and the wolf is built from primitive shapes rather
  than a rigged model. Adding real glTF character models (rigged,
  animated) is the next major piece.
- Any story/quest content
- Building, farming, and water-collection systems beyond the basic
  campfire
- Looter NPCs / defending your base
- The planned later-game settlement system (recruiting survivors,
  assigning jobs, logistics)
- Client-side wiring to actually call the save/load endpoint (saves
  aren't persisted between sessions yet)

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

Open `http://localhost:5173`. Click "Enter the Woods" to lock the
mouse and play. WASD to move, Shift to sprint, Space to jump, E to
gather/drink/interact, F to attack, C for the crafting menu.

## Deploying

Push to GitHub, connect to Render (or similar), set
`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `VITE_DISCORD_CLIENT_ID`,
and `DATABASE_URL` (a Postgres connection string, e.g. from Neon) as
environment variables, deploy. `render.yaml` is included as a
blueprint and will prompt for all four.
