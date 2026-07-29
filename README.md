# Extreme Frontier

A persistent, player-driven land/farming sim, eventually meant to run
as a Discord Activity. This is the first vertical slice: land ownership
+ a full farm loop (buy tile → plant → wait → harvest → earn money),
synced live over sockets, backed by a real database.

It is **not yet embedded in Discord** — right now it's a plain web app
you run locally in a browser, so you can test the core loop fast. Wiring
it into an actual Discord Activity (Discord Developer Portal app, OAuth,
the Embedded App SDK, HTTPS tunnel) is a separate next step once the
loop itself feels right.

## What's actually working right now

- Dev login (username only — stand-in for real Discord OAuth)
- 15x15 tile map, persisted in SQLite
- Buy land, plant one of 3 crops (wheat/corn/potato), wait for it to grow,
  harvest for money
- Fully authoritative server — client never decides outcomes, all
  validated server-side (ownership, funds, timers)
- Live sync: tile changes broadcast to every connected client over
  Socket.io, so two browser tabs (two "players") see each other's
  land claims in real time

## What's intentionally NOT here yet

- Real Discord OAuth / Activity embedding
- Animals, buildings, crafting chains, towns, marketplace, skills —
  everything else in the original vision doc
- Any art — tiles are colored squares right now

## Running it

Requires Node.js 18+.

**Terminal 1 — server:**
```bash
cd server
npm install
npm run dev
```
Starts on http://localhost:3001, creates `server/game.db` (SQLite) on
first run.

**Terminal 2 — client:**
```bash
cd client
npm install
npm run dev
```
Starts on http://localhost:5173 — open that in your browser.

Open it in two browser tabs with two different usernames to see the
live multiplayer sync (tile purchases/plants/harvests show up in both
tabs instantly).

## Tuning

Crop grow times are set short (30–90 seconds) in `server/src/gameData.ts`
so you can actually test the full loop without waiting. Bump these up
once you're happy with the mechanics.

## Next steps, roughly in order

1. Play with the loop, adjust crop economics/timers until it feels right
2. Add a second resource chain (e.g. animals) to start testing
   interdependency between professions
3. Swap dev-login for real Discord OAuth2 + the Embedded App SDK
4. Move off SQLite to Postgres once there's more than one instance
5. Add the Phaser-rendered map / real art pass
