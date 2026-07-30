import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  API_BASE, WorldConfig, GameState, PlotConfig, Direction,
  login, loginWithDiscord, getWorld, getState,
  move, travel, gather, claimPlot, nameFarm, buildBuilding, plantCrop, harvestCrop,
  sellToShop, craftItem, collectCraft, buyLivestock, collectLivestock,
} from './api';
import { authenticateWithDiscord, isInsideDiscord } from './discord';
import { TradeInvitePrompt, TradeModal, TradeSessionState } from './TradeModal';

const ITEM_ICON: Record<string, string> = {
  wood: '🪵', stone: '🪨', coin: '🪙',
  egg: '🥚', wool: '🧶', milk: '🥛',
};

function itemIconFor(item: string, world: WorldConfig | null): string {
  if (ITEM_ICON[item]) return ITEM_ICON[item];
  if (world?.crops[item]) return world.crops[item].icon;
  if (world?.craftRecipes[item]) return world.craftRecipes[item].icon;
  return '📦';
}

function chebyshev(ax: number, ay: number, bx: number, by: number) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function plotAtClient(world: WorldConfig, x: number, y: number): PlotConfig | undefined {
  return world.plots.find((p) => x >= p.x && x < p.x + p.size && y >= p.y && y < p.y + p.size);
}

function isCropReady(crop: { cropType: string; plantedAt: number }, world: WorldConfig): boolean {
  const cfg = world.crops[crop.cropType];
  if (!cfg) return false;
  return Date.now() - crop.plantedAt >= cfg.growTimeMs;
}

function isLivestockReady(animal: { type: string; lastCollectedAt: number }, world: WorldConfig): boolean {
  const cfg = world.livestock[animal.type];
  if (!cfg) return false;
  return Date.now() - animal.lastCollectedAt >= cfg.produceTimeMs;
}

function isWaterAt(world: WorldConfig, x: number, y: number): boolean {
  if (y < 0 || y >= world.terrain.length) return false;
  const row = world.terrain[y];
  if (x < 0 || x >= row.length) return false;
  return row[x] === 'water';
}

// Doors always sit at the midpoint of whichever edge they're on — must
// match the server's doorPosition() logic exactly.
function doorPositionClient(world: WorldConfig, dir: Direction): { x: number; y: number } {
  const midX = Math.floor(world.mapW / 2);
  const midY = Math.floor(world.mapH / 2);
  if (dir === 'north') return { x: midX, y: 0 };
  if (dir === 'south') return { x: midX, y: world.mapH - 1 };
  if (dir === 'west') return { x: 0, y: midY };
  return { x: world.mapW - 1, y: midY };
}

const DIRECTION_LABEL: Record<Direction, string> = { north: 'North', south: 'South', east: 'East', west: 'West' };

const MIN_CELL_PX = 6;
const DEFAULT_CELL_PX = 13;

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('owf_token'));
  const [world, setWorld] = useState<WorldConfig | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const SILENT_ERRORS = ['unauthorized', 'can only move one tile at a time', 'not walkable'];
  function showError(msg: string) {
    if (SILENT_ERRORS.some((s) => msg.toLowerCase().includes(s))) return;
    setError(msg);
  }
  const [, setTick] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const inDiscord = useMemo(() => isInsideDiscord(), []);
  const [discordAuthing, setDiscordAuthing] = useState(inDiscord);

  const [tradeInvite, setTradeInvite] = useState<{ fromId: string; fromUsername: string } | null>(null);
  const [tradeSession, setTradeSession] = useState<TradeSessionState | null>(null);
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);
  const [pendingInviteTo, setPendingInviteTo] = useState<string | null>(null);
  const [craftCategory, setCraftCategory] = useState<'food' | 'goods'>('food');
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(DEFAULT_CELL_PX);
  const [claimConfirmPlot, setClaimConfirmPlot] = useState<PlotConfig | null>(null);
  const [pendingGatherId, setPendingGatherId] = useState<string | null>(null);

  useEffect(() => {
    if (!inDiscord || token) return;
    authenticateWithDiscord()
      .then(({ discordAccessToken }) => loginWithDiscord(discordAccessToken))
      .then(({ token: t }) => { localStorage.setItem('owf_token', t); setToken(t); })
      .catch((e) => showError(e.message))
      .finally(() => setDiscordAuthing(false));
  }, [inDiscord, token]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!token) return;
    getState(token)
      .then(setState)
      .catch((e) => {
        showError(e.message);
        setToken(null);
        localStorage.removeItem('owf_token');
      });
  }, [token]);

  // Whenever the player's biome changes (initial load, or after traveling
  // through a door), refetch BOTH the static world config AND the live
  // game state. Fetching only world left resourceNodes/buildings/crops/
  // livestock/players frozen on whatever biome we were in before —
  // meaning after traveling, everything you could interact with was
  // stale data from the old biome even though the map itself looked right.
  const lastFetchedBiome = useRef<string | null>(null);
  useEffect(() => {
    if (!state || !token) return;
    const biome = state.player.biome;
    if (lastFetchedBiome.current === biome) return;
    lastFetchedBiome.current = biome;
    getWorld(biome).then(setWorld).catch((e) => showError(e.message));
    getState(token).then(setState).catch((e) => showError(e.message));
  }, [state?.player.biome, token]);

  useEffect(() => {
    if (!world) return;
    const el = mapWrapperRef.current;
    if (!el) return;
    function compute() {
      if (!el || !world) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const size = Math.floor(Math.min(w / world.mapW, h / world.mapH));
      setCellPx(Math.max(MIN_CELL_PX, size));
    }
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [world]);

  useEffect(() => {
    if (!token) return;
    const s: Socket = io(API_BASE || undefined);
    s.on('connect', () => s.emit('identify', token));
    setSocket(s);

    s.on('playerJoined', (d: { id: string; username: string; x: number; y: number; biome: string }) => {
      setState((prev) => {
        if (!prev) return prev;
        if (d.biome !== prev.player.biome) return prev;
        if (prev.players.some((p) => p.id === d.id)) return prev;
        return { ...prev, players: [...prev.players, d] };
      });
    });

    s.on('playerMoved', ({ id, x, y, biome, username }: { id: string; x: number; y: number; biome: string; username?: string }) => {
      setState((prev) => {
        if (!prev) return prev;
        if (id === prev.player.id) {
          // My own move/travel — biome may have changed. Update both the
          // player record AND my entry in the players list, since the map
          // renders avatars from the players list, not from player directly.
          const players = prev.players.map((p) => (p.id === id ? { ...p, x, y, biome } : p));
          return { ...prev, player: { ...prev.player, x, y, biome }, players };
        }
        const myBiome = prev.player.biome;
        if (biome !== myBiome) {
          // They're not in my biome (anymore, or never were) — make sure they're not shown.
          if (!prev.players.some((p) => p.id === id)) return prev;
          return { ...prev, players: prev.players.filter((p) => p.id !== id) };
        }
        const exists = prev.players.some((p) => p.id === id);
        const players = exists
          ? prev.players.map((p) => (p.id === id ? { ...p, x, y, biome } : p))
          : [...prev.players, { id, username: username ?? '???', x, y, biome }];
        return { ...prev, players };
      });
    });

    s.on('resourceUpdate', ({ id, x, y, depletedUntil }: { id: string; x: number; y: number; depletedUntil: number }) => {
      setState((prev) => {
        if (!prev) return prev;
        const resourceNodes = prev.resourceNodes.map((n) =>
          n.id === id ? { ...n, x, y, depletedUntil, available: depletedUntil <= Date.now() } : n
        );
        return { ...prev, resourceNodes };
      });
    });

    s.on('plotUpdate', ({ plotId, ownerId, username, farmName }: { plotId: string; ownerId: string; username: string; farmName: string | null }) => {
      setState((prev) => (prev ? { ...prev, plotOwners: { ...prev.plotOwners, [plotId]: { ownerId, username, farmName } } } : prev));
    });

    s.on('buildingUpdate', (b: { x: number; y: number; plotId: string; ownerId: string; type: string }) => {
      setState((prev) => (prev
        ? { ...prev, buildings: [...prev.buildings, { x: b.x, y: b.y, plot_id: b.plotId, owner_id: b.ownerId, type: b.type }] }
        : prev));
    });

    s.on('cropUpdate', (c: { x: number; y: number; ownerId?: string; cropType?: string; plantedAt?: number; removed: boolean }) => {
      setState((prev) => {
        if (!prev) return prev;
        if (c.removed) return { ...prev, crops: prev.crops.filter((cr) => !(cr.x === c.x && cr.y === c.y)) };
        return {
          ...prev,
          crops: [...prev.crops.filter((cr) => !(cr.x === c.x && cr.y === c.y)),
            { x: c.x, y: c.y, ownerId: c.ownerId!, cropType: c.cropType!, plantedAt: c.plantedAt!, ready: false }],
        };
      });
    });

    s.on('livestockUpdate', (l: { x: number; y: number; ownerId?: string; type?: string; lastCollectedAt?: number; removed: boolean }) => {
      setState((prev) => {
        if (!prev) return prev;
        if (l.removed) return { ...prev, livestock: prev.livestock.filter((a) => !(a.x === l.x && a.y === l.y)) };
        return {
          ...prev,
          livestock: [...prev.livestock.filter((a) => !(a.x === l.x && a.y === l.y)),
            { x: l.x, y: l.y, ownerId: l.ownerId!, type: l.type!, lastCollectedAt: l.lastCollectedAt!, ready: false }],
        };
      });
    });

    s.on('tradeInvite', (d: { fromId: string; fromUsername: string }) => setTradeInvite(d));
    s.on('tradeDeclined', () => { setPendingInviteTo(null); setTradeMessage('They declined the trade.'); });
    s.on('tradeStarted', (d: { sessionId: string; otherUsername: string; otherId: string }) => {
      setPendingInviteTo(null);
      setTradeInvite(null);
      setTradeSession({ sessionId: d.sessionId, otherId: d.otherId, otherUsername: d.otherUsername, offers: {}, confirmed: {} });
    });
    s.on('tradeUpdate', (d: { sessionId: string; offers: any; confirmed: any }) => {
      setTradeSession((prev) => (prev && prev.sessionId === d.sessionId ? { ...prev, offers: d.offers, confirmed: d.confirmed } : prev));
    });
    s.on('tradeComplete', (d: { inventory: Record<string, number> }) => {
      setState((prev) => (prev ? { ...prev, inventory: d.inventory } : prev));
      setTradeSession(null);
      setTradeMessage('Trade complete!');
    });
    s.on('tradeFailed', (d: { reason: string }) => {
      setTradeSession(null);
      setTradeMessage(`Trade failed: ${d.reason}`);
    });
    s.on('tradeCancelled', () => {
      setTradeSession(null);
      setTradeMessage('Trade was cancelled.');
    });

    return () => { s.disconnect(); };
  }, [token]);

  const playerPosRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (state) playerPosRef.current = { x: state.player.x, y: state.player.y };
  }, [state?.player.x, state?.player.y]);

  useEffect(() => {
    if (!token || !state || !world) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowUp' || e.key === 'w') dy = -1;
      else if (e.key === 'ArrowDown' || e.key === 's') dy = 1;
      else if (e.key === 'ArrowLeft' || e.key === 'a') dx = -1;
      else if (e.key === 'ArrowRight' || e.key === 'd') dx = 1;
      else return;
      e.preventDefault();

      const prevX = playerPosRef.current.x;
      const prevY = playerPosRef.current.y;
      const nx = prevX + dx;
      const ny = prevY + dy;
      playerPosRef.current = { x: nx, y: ny };

      setState((prev) => {
        if (!prev) return prev;
        const players = prev.players.map((p) => (p.id === prev.player.id ? { ...p, x: nx, y: ny } : p));
        return { ...prev, player: { ...prev.player, x: nx, y: ny }, players };
      });

      move(token!, nx, ny).catch((err) => {
        showError(err.message);
        if (playerPosRef.current.x === nx && playerPosRef.current.y === ny) {
          playerPosRef.current = { x: prevX, y: prevY };
        }
        setState((prev) => {
          if (!prev || prev.player.x !== nx || prev.player.y !== ny) return prev;
          const players = prev.players.map((p) => (p.id === prev.player.id ? { ...p, x: prevX, y: prevY } : p));
          return { ...prev, player: { ...prev.player, x: prevX, y: prevY }, players };
        });
      });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [token, state, world]);

  const handleGather = useCallback((nodeId: string) => {
    if (!token || pendingGatherId) return;
    setPendingGatherId(nodeId);
    gather(token, nodeId)
      .then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p)))
      .catch((e) => showError(e.message))
      .finally(() => setPendingGatherId(null));
  }, [token, pendingGatherId]);

  const handleClaim = useCallback((plotId: string) => {
    if (!token) return;
    claimPlot(token, plotId)
      .then((r) => {
        setState((p) => (p ? { ...p, inventory: r.inventory } : p));
        setClaimConfirmPlot(null);
      })
      .catch((e) => {
        showError(e.message);
        setClaimConfirmPlot(null);
      });
  }, [token]);

  const handleBuild = useCallback((x: number, y: number, type: string) => {
    if (!token) return;
    buildBuilding(token, x, y, type).then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p))).catch((e) => showError(e.message));
  }, [token]);

  const handlePlant = useCallback((x: number, y: number, cropType: string) => {
    if (!token) return;
    plantCrop(token, x, y, cropType).catch((e) => showError(e.message));
  }, [token]);

  const handleHarvest = useCallback((x: number, y: number) => {
    if (!token) return;
    harvestCrop(token, x, y).then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p))).catch((e) => showError(e.message));
  }, [token]);

  const handleSell = useCallback((item: string, qty: number) => {
    if (!token) return;
    sellToShop(token, item, qty)
      .then((r) => setState((p) => (p ? { ...p, inventory: r.inventory, shopPrices: r.shopPrices } : p)))
      .catch((e) => showError(e.message));
  }, [token]);

  const handleCraft = useCallback((recipeId: string) => {
    if (!token) return;
    craftItem(token, recipeId)
      .then((r) => setState((p) => (p ? { ...p, inventory: r.inventory, craftJob: r.craftJob } : p)))
      .catch((e) => showError(e.message));
  }, [token]);

  const handleCollectCraft = useCallback(() => {
    if (!token) return;
    collectCraft(token)
      .then((r) => setState((p) => (p ? { ...p, inventory: r.inventory, craftJob: r.craftJob } : p)))
      .catch((e) => showError(e.message));
  }, [token]);

  const handleNameFarm = useCallback((plotId: string, name: string) => {
    if (!token) return;
    nameFarm(token, plotId, name).catch((e) => showError(e.message));
  }, [token]);

  const handleBuyLivestock = useCallback((x: number, y: number, type: string) => {
    if (!token) return;
    buyLivestock(token, x, y, type).then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p))).catch((e) => showError(e.message));
  }, [token]);

  const handleCollectLivestock = useCallback((x: number, y: number) => {
    if (!token) return;
    collectLivestock(token, x, y).then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p))).catch((e) => showError(e.message));
  }, [token]);

  const handleTravel = useCallback((direction: Direction) => {
    if (!token) return;
    travel(token, direction).catch((e) => showError(e.message));
  }, [token]);

  function requestTrade(targetId: string) {
    if (!socket) return;
    setPendingInviteTo(targetId);
    socket.emit('tradeRequest', { targetId });
  }
  function acceptInvite() {
    if (!socket || !tradeInvite) return;
    socket.emit('tradeAccept', { fromId: tradeInvite.fromId });
  }
  function declineInvite() {
    if (!socket || !tradeInvite) return;
    socket.emit('tradeDecline', { fromId: tradeInvite.fromId });
    setTradeInvite(null);
  }
  function updateOffer(items: Record<string, number>) {
    if (!socket || !tradeSession) return;
    socket.emit('tradeOffer', { sessionId: tradeSession.sessionId, items });
  }
  function confirmTrade() {
    if (!socket || !tradeSession) return;
    socket.emit('tradeConfirm', { sessionId: tradeSession.sessionId });
  }
  function cancelTrade() {
    if (!socket || !tradeSession) return;
    socket.emit('tradeCancel', { sessionId: tradeSession.sessionId });
    setTradeSession(null);
  }

  if (!token || !state || !world) {
    if (inDiscord) {
      return (
        <div className="login-screen">
          <h1>🤠 Extreme Frontier</h1>
          <p>{discordAuthing ? 'Signing you in with Discord…' : 'Loading the frontier…'}</p>
          {error && <div className="error-banner">{error}</div>}
        </div>
      );
    }
    return <LoginScreen onLoggedIn={(t) => { localStorage.setItem('owf_token', t); setToken(t); }} error={error} />;
  }

  const me = state.player;
  function ItemIcon({ item }: { item: string }) {
    return <span>{itemIconFor(item, world)}</span>;
  }
  const here = { x: me.x, y: me.y };
  const occupyingPlot = plotAtClient(world, here.x, here.y);
  const plotOwner = occupyingPlot ? state.plotOwners[occupyingPlot.id] : undefined;
  const isMyPlot = !!plotOwner && plotOwner.ownerId === me.id;
  const isUnclaimed = !!occupyingPlot && !plotOwner;
  const buildingHere = state.buildings.find((b) => b.x === here.x && b.y === here.y);
  const cropHere = state.crops.find((c) => c.x === here.x && c.y === here.y);
  const livestockHere = state.livestock.find((a) => a.x === here.x && a.y === here.y);
  const decorationHere = world.decorations.find((d) => d.x === here.x && d.y === here.y);
  const nearbyNodes = state.resourceNodes.filter((n) => chebyshev(here.x, here.y, n.x, n.y) <= 1 && n.depletedUntil <= Date.now());
  const nearbyPlayers = state.players.filter((p) => p.id !== me.id && chebyshev(here.x, here.y, p.x, p.y) <= 1);
  const nearShop = world.biomeId === 'shop' && chebyshev(here.x, here.y, world.shopDoor.x, world.shopDoor.y) <= 1;

  // Door detection: which direction (if any) is the player currently standing on?
  const standingDoorDir = (Object.keys(world.doors) as Direction[]).find((dir) => {
    const pos = doorPositionClient(world, dir);
    return pos.x === here.x && pos.y === here.y;
  });
  const standingDoorDest = standingDoorDir ? world.doors[standingDoorDir] : undefined;

  const myPlotIds = Object.entries(state.plotOwners).filter(([, o]) => o.ownerId === me.id).map(([id]) => id);
  const hasCabin = !!occupyingPlot && state.buildings.some((b) => b.plot_id === occupyingPlot.id && b.type === 'cabin');
  const hasShed = !!occupyingPlot && state.buildings.some((b) => b.plot_id === occupyingPlot.id && b.type === 'shed');
  const hasBarn = !!occupyingPlot && state.buildings.some((b) => b.plot_id === occupyingPlot.id && b.type === 'barn');
  const tileFree = !buildingHere && !cropHere && !livestockHere;

  return (
    <div className="app">
      <header className="topbar">
        <h1>🤠 Extreme Frontier</h1>
        <div className="stats">
          <span className="username">{me.username}</span>
          <span className="biome-pill">📍 {world.biomeName}</span>
          {Object.entries(state.inventory)
            .filter(([, qty]) => qty > 0)
            .map(([item, qty]) => (
              <span key={item} className="inv-pill"><ItemIcon item={item} /> {qty}</span>
            ))}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {tradeMessage && (
        <div className="info-banner" onClick={() => setTradeMessage(null)}>{tradeMessage} (tap to dismiss)</div>
      )}

      <div className="game-layout">
        <div className="map-wrapper" ref={mapWrapperRef}>
          <div
            className="map-grid"
            style={{ gridTemplateColumns: `repeat(${world.mapW}, ${cellPx}px)`, gridTemplateRows: `repeat(${world.mapH}, ${cellPx}px)` }}
          >
            {world.terrain.map((row, y) =>
              row.map((terrain, x) => {
                const plot = plotAtClient(world, x, y);
                const owner = plot ? state.plotOwners[plot.id] : undefined;
                const building = state.buildings.find((b) => b.x === x && b.y === y);
                const crop = state.crops.find((c) => c.x === x && c.y === y);
                const animal = state.livestock.find((a) => a.x === x && a.y === y);
                const node = state.resourceNodes.find((n) => n.x === x && n.y === y);
                const decoration = world.decorations.find((d) => d.x === x && d.y === y);
                const isPath = world.paths.some((p) => p.x === x && p.y === y);
                const isDoorTile = (Object.keys(world.doors) as Direction[]).some((dir) => {
                  const pos = doorPositionClient(world, dir);
                  return pos.x === x && pos.y === y;
                });
                const isShopCounter = world.biomeId === 'shop' && x === world.shopDoor.x && y === world.shopDoor.y;
                const isShopBuildingTile = !!world.building &&
                  x >= world.building.x && x < world.building.x + world.building.w &&
                  y >= world.building.y && y < world.building.y + world.building.h;
                const isBuildingAnchor = !!world.building && x === world.building.x && y === world.building.y;
                const playersHere = state.players.filter((p) => p.x === x && p.y === y);

                let waterStyle: React.CSSProperties | undefined;
                if (terrain === 'water') {
                  const n = isWaterAt(world, x, y - 1);
                  const s = isWaterAt(world, x, y + 1);
                  const w = isWaterAt(world, x - 1, y);
                  const e = isWaterAt(world, x + 1, y);
                  const tl = !n && !w ? '45%' : '0';
                  const tr = !n && !e ? '45%' : '0';
                  const br = !s && !e ? '45%' : '0';
                  const bl = !s && !w ? '45%' : '0';
                  waterStyle = { borderRadius: `${tl} ${tr} ${br} ${bl}` };
                }

                const cls = [
                  'cell',
                  terrain === 'water' && 'cell-water',
                  terrain === 'grass' && !plot && !isPath && !isDoorTile && !isShopBuildingTile && (world.biomeId === 'fall' ? 'cell-grass-fall' : 'cell-grass'),
                  isShopBuildingTile && 'cell-shop-building',
                  isPath && 'cell-path',
                  isDoorTile && 'cell-door',
                  isShopCounter && 'cell-shop-counter',
                  plot && !owner && 'cell-plot-unclaimed',
                  plot && owner && owner.ownerId === me.id && 'cell-plot-mine',
                  plot && owner && owner.ownerId !== me.id && 'cell-plot-other',
                ].filter(Boolean).join(' ');

                let content: string | null = null;
                let iconStyle: React.CSSProperties | undefined;
                if (isBuildingAnchor && world.building) {
                  content = world.building.icon;
                  const size = Math.min(world.building.w, world.building.h) * cellPx * 0.8;
                  iconStyle = {
                    fontSize: `${size}px`,
                    transform: `translate(${(world.building.w - 1) * cellPx / 2}px, ${(world.building.h - 1) * cellPx / 2}px)`,
                    zIndex: 2,
                  };
                } else if (isDoorTile) content = '🚪';
                else if (isShopCounter) content = '🚪';
                else if (decoration) content = decoration.icon;
                else if (building) content = world.buildings[building.type]?.icon ?? '🏗️';
                else if (animal) content = world.livestock[animal.type]?.icon ?? '🐾';
                else if (crop) content = world.crops[crop.cropType]?.icon ?? '🌱';
                else if (node && node.depletedUntil <= Date.now()) {
                  content = node.icon;
                }

                return (
                  <div key={`${x},${y}`} className={cls} style={waterStyle} title={`${x},${y}`}>
                    {content && <span className="cell-icon" style={iconStyle}>{content}</span>}
                    {playersHere.map((p) => (
                      <span key={p.id} className={`avatar ${p.id === me.id ? 'avatar-me' : ''}`} title={p.username}>
                        {p.id === me.id ? '🤠' : '🧑\u200d🌾'}
                      </span>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="side-panel">
          <h3>Here</h3>

          {standingDoorDir && standingDoorDest && (
            <button className="sell-option" onClick={() => handleTravel(standingDoorDir)}>
              🚪 Travel {DIRECTION_LABEL[standingDoorDir]} to {standingDoorDest}?
            </button>
          )}

          {decorationHere && (
            <p className="modal-note">{decorationHere.icon} Just scenery — nothing to gather here.</p>
          )}

          {isUnclaimed && occupyingPlot && (() => {
            const tier = world.homesteadTiers[occupyingPlot.size];
            const canAfford = (state.inventory.coin ?? 0) >= tier.cost;
            const atCap = myPlotIds.length >= world.maxHomesteads;
            return (
              <button
                className="crop-option"
                disabled={!canAfford || atCap}
                onClick={() => setClaimConfirmPlot(occupyingPlot)}
              >
                🏡 Claim this {tier.label} homestead — {tier.cost} <ItemIcon item="coin" />
              </button>
            );
          })()}
          {isUnclaimed && myPlotIds.length >= world.maxHomesteads && (
            <p className="modal-note">You already own the max of {world.maxHomesteads} homesteads.</p>
          )}
          {occupyingPlot && plotOwner && (
            <p className="modal-note">
              {isMyPlot
                ? (plotOwner.farmName ? `Your homestead: "${plotOwner.farmName}"` : 'Your homestead — unnamed')
                : (plotOwner.farmName ? `${plotOwner.farmName} (${plotOwner.username}'s homestead)` : `${plotOwner.username}'s homestead`)}
            </p>
          )}
          {isMyPlot && occupyingPlot && (
            <FarmNameForm currentName={plotOwner?.farmName ?? null} onSave={(name) => handleNameFarm(occupyingPlot.id, name)} />
          )}
          {isMyPlot && !hasCabin && (
            <p className="modal-note">⚠️ Build a Cabin here first — nothing else works on this homestead without one.</p>
          )}

          {buildingHere && <p className="modal-note">{world.buildings[buildingHere.type]?.icon} {world.buildings[buildingHere.type]?.name}</p>}

          {cropHere && (
            isCropReady(cropHere, world)
              ? <button className="crop-option" onClick={() => handleHarvest(here.x, here.y)}>
                  {world.crops[cropHere.cropType]?.icon} Harvest {world.crops[cropHere.cropType]?.name}
                </button>
              : <p className="modal-note">Growing {world.crops[cropHere.cropType]?.name}… ready in {Math.max(0, Math.ceil((world.crops[cropHere.cropType].growTimeMs - (Date.now() - cropHere.plantedAt)) / 1000))}s</p>
          )}

          {livestockHere && (
            isLivestockReady(livestockHere, world)
              ? <button className="crop-option" onClick={() => handleCollectLivestock(here.x, here.y)}>
                  {world.livestock[livestockHere.type]?.produceIcon} Collect {world.livestock[livestockHere.type]?.produceItem} from {world.livestock[livestockHere.type]?.name}
                </button>
              : <p className="modal-note">{world.livestock[livestockHere.type]?.icon} {world.livestock[livestockHere.type]?.name} — produce ready in {Math.max(0, Math.ceil((world.livestock[livestockHere.type].produceTimeMs - (Date.now() - livestockHere.lastCollectedAt)) / 1000))}s</p>
          )}

          {isMyPlot && tileFree && (
            <>
              <h4>Build</h4>
              {Object.values(world.buildings).map((b) => {
                const affordable = Object.entries(b.cost).every(([item, qty]) => (state.inventory[item] ?? 0) >= (qty as number));
                const locked = b.id !== 'cabin' && !hasCabin;
                return (
                  <button key={b.id} className="crop-option" disabled={!affordable || locked} onClick={() => handleBuild(here.x, here.y, b.id)}>
                    {b.icon} {b.name} — {Object.entries(b.cost).map(([i, q]) => `${q} ${i}`).join(', ')}
                    {locked && ' (needs Cabin)'}
                  </button>
                );
              })}

              <h4>Plant {!hasShed && '(needs Shed)'}</h4>
              {hasCabin && hasShed && Object.values(world.crops).map((c) => (
                <button key={c.id} className="crop-option" onClick={() => handlePlant(here.x, here.y, c.id)}>
                  {c.icon} {c.name} — grows {Math.round(c.growTimeMs / 1000)}s, yields {c.yieldAmount}
                </button>
              ))}

              <h4>Livestock {!hasBarn && '(needs Barn)'}</h4>
              {hasCabin && hasBarn && Object.values(world.livestock).map((l) => {
                const affordable = (state.inventory.coin ?? 0) >= l.cost;
                return (
                  <button key={l.id} className="crop-option" disabled={!affordable} onClick={() => handleBuyLivestock(here.x, here.y, l.id)}>
                    {l.icon} {l.name} — {l.cost} <ItemIcon item="coin" /> (produces {l.produceIcon} {l.produceItem})
                  </button>
                );
              })}
            </>
          )}

          {world.homesteadsAllowed && (
            <>
              <h4>🔨 Craft</h4>
              {state.craftJob && (() => {
                const recipe = world.craftRecipes[state.craftJob.recipeId];
                const ready = Date.now() - state.craftJob.startedAt >= recipe.craftTimeMs;
                return ready ? (
                  <button className="crop-option" onClick={handleCollectCraft}>
                    {recipe.icon} Collect {recipe.name} ({recipe.outputQty}x)
                  </button>
                ) : (
                  <p className="modal-note">
                    {recipe.icon} Crafting {recipe.name}… ready in {Math.max(0, Math.ceil((recipe.craftTimeMs - (Date.now() - state.craftJob.startedAt)) / 1000))}s
                  </p>
                );
              })()}
              <div className="craft-tabs">
                <button
                  className={`craft-tab ${craftCategory === 'food' ? 'craft-tab-active' : ''}`}
                  onClick={() => setCraftCategory('food')}
                >
                  🍞 Food
                </button>
                <button
                  className={`craft-tab ${craftCategory === 'goods' ? 'craft-tab-active' : ''}`}
                  onClick={() => setCraftCategory('goods')}
                >
                  🛠️ Goods
                </button>
              </div>
              {Object.values(world.craftRecipes)
                .filter((r) => r.category === craftCategory)
                .map((r) => ({
                  r,
                  affordable: Object.entries(r.inputs).every(([item, qty]) => (state.inventory[item] ?? 0) >= (qty as number)),
                }))
                .sort((a, b) => (a.affordable === b.affordable ? 0 : a.affordable ? -1 : 1))
                .map(({ r, affordable }) => (
                  <button key={r.id} className="crop-option" disabled={!affordable || !!state.craftJob} onClick={() => handleCraft(r.id)}>
                    {r.icon} {r.name} — needs {Object.entries(r.inputs).map(([i, q]) => `${q} ${i}`).join(', ')} → {r.outputQty}x, takes {Math.round(r.craftTimeMs / 1000)}s
                    {state.shopPrices[r.id] && ` (sells for ${state.shopPrices[r.id]})`}
                  </button>
                ))}
            </>
          )}

          {nearbyNodes.length > 0 && (
            <>
              <h4>Nearby resources</h4>
              {nearbyNodes.map((n) => {
                const available = n.depletedUntil <= Date.now();
                return (
                  <button key={n.id} className="crop-option" disabled={!available || !!pendingGatherId} onClick={() => handleGather(n.id)}>
                    {n.icon} Gather {n.type} {!available && `(back in ${Math.max(0, Math.ceil((n.depletedUntil - Date.now()) / 1000))}s)`}
                  </button>
                );
              })}
            </>
          )}

          {nearbyPlayers.length > 0 && (
            <>
              <h4>Nearby folks</h4>
              {nearbyPlayers.map((p) => (
                <button
                  key={p.id}
                  className="sell-option"
                  disabled={pendingInviteTo === p.id}
                  onClick={() => requestTrade(p.id)}
                >
                  🤝 {pendingInviteTo === p.id ? `Waiting on ${p.username}…` : `Trade with ${p.username}`}
                </button>
              ))}
            </>
          )}

          {nearShop && (
            <>
              <h4>🏪 General Store</h4>
              <p className="modal-note">Sell crafted goods for coins. Prices dip the more you dump at once, and recover over time.</p>
              {Object.entries(state.shopPrices)
                .filter(([item]) => (state.inventory[item] ?? 0) > 0)
                .map(([item, price]) => (
                  <button key={item} className="sell-option" onClick={() => handleSell(item, state.inventory[item])}>
                    <ItemIcon item={item} /> Sell all {item} ({state.inventory[item]}) for {price * state.inventory[item]} <ItemIcon item="coin" /> ({price} ea)
                  </button>
                ))}
              {Object.entries(state.shopPrices).every(([item]) => (state.inventory[item] ?? 0) === 0) && (
                <p className="modal-note">You don't have any crafted goods to sell right now.</p>
              )}
            </>
          )}

          <p className="controls-hint">Move with arrow keys or WASD</p>
        </div>
      </div>

      {claimConfirmPlot && (() => {
        const tier = world.homesteadTiers[claimConfirmPlot.size];
        return (
          <div className="modal-backdrop" onClick={() => setClaimConfirmPlot(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Confirm homestead purchase</h3>
              <p className="modal-note">
                {tier.label} homestead ({claimConfirmPlot.size}x{claimConfirmPlot.size}) — {tier.cost} coins
              </p>
              <p className="warning-note">
                ⚠️ Homesteads can NEVER be sold, refunded, or exchanged once purchased. This is permanent.
              </p>
              <button className="sell-option" onClick={() => handleClaim(claimConfirmPlot.id)}>
                Confirm purchase
              </button>
              <button className="cancel" onClick={() => setClaimConfirmPlot(null)}>Cancel</button>
            </div>
          </div>
        );
      })()}

      {tradeInvite && (
        <TradeInvitePrompt fromUsername={tradeInvite.fromUsername} onAccept={acceptInvite} onDecline={declineInvite} />
      )}
      {tradeSession && (
        <TradeModal
          session={tradeSession}
          myId={me.id}
          myInventory={state.inventory}
          onUpdateOffer={updateOffer}
          onConfirm={confirmTrade}
          onCancel={cancelTrade}
        />
      )}
    </div>
  );
}

function FarmNameForm({ currentName, onSave }: { currentName: string | null; onSave: (name: string) => void }) {
  const [name, setName] = useState(currentName ?? '');
  return (
    <div className="trade-row" style={{ marginBottom: 6 }}>
      <input
        placeholder="Name your farm"
        value={name}
        maxLength={30}
        onChange={(e) => setName(e.target.value)}
        style={{ flex: 1 }}
      />
      <button className="crop-option" disabled={name.trim().length < 1} onClick={() => onSave(name.trim())}>Save</button>
    </div>
  );
}

function LoginScreen({ onLoggedIn, error }: { onLoggedIn: (token: string) => void; error: string | null }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setLocalError(null);
    try {
      const { token } = await login(username);
      onLoggedIn(token);
    } catch (e: any) {
      setLocalError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <h1>🤠 Extreme Frontier</h1>
      <p>Stake your claim. Build your homestead. Barter for what you need.</p>
      <input
        placeholder="Pick a name, partner"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button disabled={busy || username.trim().length < 2} onClick={submit}>
        {busy ? 'Ridin\' in…' : 'Head West'}
      </button>
      {(localError || error) && <div className="error-banner">{localError || error}</div>}
    </div>
  );
}
