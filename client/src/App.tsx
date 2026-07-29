import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  API_BASE, WorldConfig, GameState, PlotConfig,
  login, loginWithDiscord, getWorld, getState,
  move, gather, claimPlot, nameFarm, buildBuilding, plantCrop, harvestCrop,
  sellToShop, craftItem, buyLivestock, collectLivestock,
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

function distToRect(px: number, py: number, rx: number, ry: number, size: number) {
  const dx = Math.max(rx - px, 0, px - (rx + size - 1));
  const dy = Math.max(ry - py, 0, py - (ry + size - 1));
  return Math.max(dx, dy);
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

const CELL_PX = 18;

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('owf_token'));
  const [world, setWorld] = useState<WorldConfig | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const inDiscord = useMemo(() => isInsideDiscord(), []);
  const [discordAuthing, setDiscordAuthing] = useState(inDiscord);

  const [tradeInvite, setTradeInvite] = useState<{ fromId: string; fromUsername: string } | null>(null);
  const [tradeSession, setTradeSession] = useState<TradeSessionState | null>(null);
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);
  const [pendingInviteTo, setPendingInviteTo] = useState<string | null>(null);

  useEffect(() => {
    if (!inDiscord || token) return;
    authenticateWithDiscord()
      .then(({ discordAccessToken }) => loginWithDiscord(discordAccessToken))
      .then(({ token: t }) => { localStorage.setItem('owf_token', t); setToken(t); })
      .catch((e) => setError(e.message))
      .finally(() => setDiscordAuthing(false));
  }, [inDiscord, token]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    getWorld().then(setWorld).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!token) return;
    getState(token)
      .then(setState)
      .catch((e) => {
        setError(e.message);
        setToken(null);
        localStorage.removeItem('owf_token');
      });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const s: Socket = io(API_BASE || undefined);
    s.on('connect', () => s.emit('identify', token));
    setSocket(s);

    s.on('playerJoined', (d: { id: string; username: string; x: number; y: number }) => {
      setState((prev) => {
        if (!prev) return prev;
        if (prev.players.some((p) => p.id === d.id)) return prev;
        return { ...prev, players: [...prev.players, d] };
      });
    });

    s.on('playerMoved', ({ id, x, y }: { id: string; x: number; y: number }) => {
      setState((prev) => {
        if (!prev) return prev;
        const players = prev.players.map((p) => (p.id === id ? { ...p, x, y } : p));
        const player = prev.player.id === id ? { ...prev.player, x, y } : prev.player;
        return { ...prev, players, player };
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
      const nx = state!.player.x + dx;
      const ny = state!.player.y + dy;
      move(token!, nx, ny).catch((err) => setError(err.message));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [token, state, world]);

  const handleGather = useCallback((nodeId: string) => {
    if (!token) return;
    gather(token, nodeId).then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p))).catch((e) => setError(e.message));
  }, [token]);

  const handleClaim = useCallback((plotId: string) => {
    if (!token) return;
    claimPlot(token, plotId).then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p))).catch((e) => setError(e.message));
  }, [token]);

  const handleBuild = useCallback((x: number, y: number, type: string) => {
    if (!token) return;
    buildBuilding(token, x, y, type).then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p))).catch((e) => setError(e.message));
  }, [token]);

  const handlePlant = useCallback((x: number, y: number, cropType: string) => {
    if (!token) return;
    plantCrop(token, x, y, cropType).catch((e) => setError(e.message));
  }, [token]);

  const handleHarvest = useCallback((x: number, y: number) => {
    if (!token) return;
    harvestCrop(token, x, y).then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p))).catch((e) => setError(e.message));
  }, [token]);

  const handleSell = useCallback((item: string, qty: number) => {
    if (!token) return;
    sellToShop(token, item, qty).then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p))).catch((e) => setError(e.message));
  }, [token]);

  const handleCraft = useCallback((recipeId: string) => {
    if (!token) return;
    craftItem(token, recipeId).then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p))).catch((e) => setError(e.message));
  }, [token]);

  const handleNameFarm = useCallback((plotId: string, name: string) => {
    if (!token) return;
    nameFarm(token, plotId, name).catch((e) => setError(e.message));
  }, [token]);

  const handleBuyLivestock = useCallback((x: number, y: number, type: string) => {
    if (!token) return;
    buyLivestock(token, x, y, type).then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p))).catch((e) => setError(e.message));
  }, [token]);

  const handleCollectLivestock = useCallback((x: number, y: number) => {
    if (!token) return;
    collectLivestock(token, x, y).then((r) => setState((p) => (p ? { ...p, inventory: r.inventory } : p))).catch((e) => setError(e.message));
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
  const nearbyNodes = state.resourceNodes.filter((n) => chebyshev(here.x, here.y, n.x, n.y) <= 1);
  const nearbyPlayers = state.players.filter((p) => p.id !== me.id && chebyshev(here.x, here.y, p.x, p.y) <= 1);
  const nearShop = distToRect(here.x, here.y, world.shopLocation.x, world.shopLocation.y, world.shopLocation.size) <= 1;

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
        <div className="map-wrapper">
          <div
            className="map-grid"
            style={{ gridTemplateColumns: `repeat(${world.mapW}, ${CELL_PX}px)`, gridTemplateRows: `repeat(${world.mapH}, ${CELL_PX}px)` }}
          >
            {world.terrain.map((row, y) =>
              row.map((terrain, x) => {
                const plot = plotAtClient(world, x, y);
                const owner = plot ? state.plotOwners[plot.id] : undefined;
                const building = state.buildings.find((b) => b.x === x && b.y === y);
                const crop = state.crops.find((c) => c.x === x && c.y === y);
                const animal = state.livestock.find((a) => a.x === x && a.y === y);
                const node = state.resourceNodes.find((n) => n.x === x && n.y === y);
                const playersHere = state.players.filter((p) => p.x === x && p.y === y);
                const isShopTile = x >= world.shopLocation.x && x < world.shopLocation.x + world.shopLocation.size &&
                  y >= world.shopLocation.y && y < world.shopLocation.y + world.shopLocation.size;

                const cls = [
                  'cell',
                  terrain === 'water' && 'cell-water',
                  terrain === 'grass' && !plot && !isShopTile && 'cell-grass',
                  isShopTile && 'cell-shop',
                  plot && !owner && 'cell-plot-unclaimed',
                  plot && owner && owner.ownerId === me.id && 'cell-plot-mine',
                  plot && owner && owner.ownerId !== me.id && 'cell-plot-other',
                ].filter(Boolean).join(' ');

                let content: string | null = null;
                const shopCenter = Math.floor(world.shopLocation.size / 2);
                if (isShopTile && x === world.shopLocation.x + shopCenter && y === world.shopLocation.y + shopCenter) content = '🏪';
                else if (building) content = world.buildings[building.type]?.icon ?? '🏗️';
                else if (animal) content = world.livestock[animal.type]?.icon ?? '🐾';
                else if (crop) content = world.crops[crop.cropType]?.icon ?? '🌱';
                else if (node) {
                  const nodeAvailable = node.depletedUntil <= Date.now();
                  content = node.type === 'wood' ? (nodeAvailable ? '🌲' : '🪵') : (nodeAvailable ? '🪨' : '⛏️');
                }

                return (
                  <div key={`${x},${y}`} className={cls} title={`${x},${y}`}>
                    {content && <span className="cell-icon">{content}</span>}
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
          {isUnclaimed && occupyingPlot && (
            <button
              className="crop-option"
              disabled={(state.inventory.coin ?? 0) < world.homesteadCost || myPlotIds.length >= world.maxHomesteads}
              onClick={() => handleClaim(occupyingPlot.id)}
            >
              🏡 Claim this homestead — {world.homesteadCost} <ItemIcon item="coin" />
            </button>
          )}
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

          <h4>🔨 Craft</h4>
          {Object.values(world.craftRecipes).map((r) => {
            const affordable = Object.entries(r.inputs).every(([item, qty]) => (state.inventory[item] ?? 0) >= (qty as number));
            return (
              <button key={r.id} className="crop-option" disabled={!affordable} onClick={() => handleCraft(r.id)}>
                {r.icon} {r.name} — needs {Object.entries(r.inputs).map(([i, q]) => `${q} ${i}`).join(', ')} → {r.outputQty}x
              </button>
            );
          })}

          {nearbyNodes.length > 0 && (
            <>
              <h4>Nearby resources</h4>
              {nearbyNodes.map((n) => {
                const available = n.depletedUntil <= Date.now();
                return (
                  <button key={n.id} className="crop-option" disabled={!available} onClick={() => handleGather(n.id)}>
                    {n.type === 'wood' ? '🌲' : '🪨'} Gather {n.type} {!available && `(back in ${Math.max(0, Math.ceil((n.depletedUntil - Date.now()) / 1000))}s)`}
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
              <p className="modal-note">Sell crafted goods for coins.</p>
              {Object.entries(world.sellPrices)
                .filter(([item]) => (state.inventory[item] ?? 0) > 0)
                .map(([item, price]) => (
                  <button key={item} className="sell-option" onClick={() => handleSell(item, state.inventory[item])}>
                    <ItemIcon item={item} /> Sell all {item} ({state.inventory[item]}) for {price * state.inventory[item]} <ItemIcon item="coin" />
                  </button>
                ))}
              {Object.entries(world.sellPrices).every(([item]) => (state.inventory[item] ?? 0) === 0) && (
                <p className="modal-note">You don't have any crafted goods to sell right now.</p>
              )}
            </>
          )}

          <p className="controls-hint">Move with arrow keys or WASD</p>
        </div>
      </div>

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
