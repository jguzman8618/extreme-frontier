export const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export interface Player {
  id: string;
  username: string;
  discord_id: string | null;
  x: number;
  y: number;
  created_at: number;
}

export interface PublicPlayer {
  id: string;
  username: string;
  x: number;
  y: number;
}

export interface ResourceNodeState {
  id: string;
  x: number;
  y: number;
  type: 'wood' | 'stone';
  respawnMs: number;
  yieldAmount: number;
  depletedUntil: number;
  available: boolean;
}

export interface PlotConfig {
  id: string;
  x: number;
  y: number;
  size: number;
}

export interface CropConfig {
  id: string;
  name: string;
  icon: string;
  growTimeMs: number;
  yieldAmount: number;
}

export interface BuildingConfig {
  id: string;
  name: string;
  icon: string;
  cost: Partial<Record<'wood' | 'stone', number>>;
}

export interface LivestockConfig {
  id: string;
  name: string;
  icon: string;
  cost: number;
  produceItem: string;
  produceIcon: string;
  produceQty: number;
  produceTimeMs: number;
}

export interface CraftRecipeConfig {
  id: string;
  name: string;
  icon: string;
  category: 'food' | 'goods';
  inputs: Record<string, number>;
  outputQty: number;
  craftTimeMs: number;
}

export interface WorldConfig {
  mapW: number;
  mapH: number;
  terrain: string[][];
  plots: PlotConfig[];
  crops: Record<string, CropConfig>;
  buildings: Record<string, BuildingConfig>;
  livestock: Record<string, LivestockConfig>;
  shopLocation: { x: number; y: number; size: number };
  sellPrices: Record<string, number>;
  craftRecipes: Record<string, CraftRecipeConfig>;
  homesteadTiers: Record<number, { label: string; cost: number }>;
  maxHomesteads: number;
}

export interface CropInstance {
  x: number;
  y: number;
  ownerId: string;
  cropType: string;
  plantedAt: number;
  ready: boolean;
}

export interface LivestockInstance {
  x: number;
  y: number;
  ownerId: string;
  type: string;
  lastCollectedAt: number;
  ready: boolean;
}

export interface BuildingInstance {
  x: number;
  y: number;
  plot_id: string;
  owner_id: string;
  type: string;
}

export interface PlotOwners {
  [plotId: string]: { ownerId: string; username: string; farmName: string | null };
}

export interface CraftJob {
  recipeId: string;
  startedAt: number;
  ready: boolean;
}

export interface GameState {
  player: Player;
  inventory: Record<string, number>;
  players: PublicPlayer[];
  plotOwners: PlotOwners;
  buildings: BuildingInstance[];
  crops: CropInstance[];
  livestock: LivestockInstance[];
  resourceNodes: ResourceNodeState[];
  craftJob: CraftJob | null;
  shopPrices: Record<string, number>;
}

async function handle(res: Response) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'request failed');
  return data;
}

export async function login(username: string): Promise<{ token: string; player: Player; inventory: Record<string, number> }> {
  return handle(await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  }));
}

export async function loginWithDiscord(discordAccessToken: string) {
  return handle(await fetch(`${API_BASE}/api/login/discord`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: discordAccessToken }),
  }));
}

export async function getWorld(): Promise<WorldConfig> {
  return handle(await fetch(`${API_BASE}/api/world`));
}

export async function getState(token: string): Promise<GameState> {
  return handle(await fetch(`${API_BASE}/api/state`, { headers: { Authorization: `Bearer ${token}` } }));
}

async function post(token: string, path: string, body?: unknown) {
  return handle(await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  }));
}

export const move = (token: string, x: number, y: number) => post(token, '/api/move', { x, y });
export const gather = (token: string, nodeId: string) => post(token, '/api/gather', { nodeId });
export const claimPlot = (token: string, plotId: string) => post(token, `/api/plots/${plotId}/claim`);
export const nameFarm = (token: string, plotId: string, name: string) => post(token, `/api/plots/${plotId}/name`, { name });
export const buildBuilding = (token: string, x: number, y: number, type: string) => post(token, '/api/buildings', { x, y, type });
export const plantCrop = (token: string, x: number, y: number, cropType: string) => post(token, '/api/crops/plant', { x, y, cropType });
export const harvestCrop = (token: string, x: number, y: number) => post(token, '/api/crops/harvest', { x, y });
export const sellToShop = (token: string, item: string, qty: number) => post(token, '/api/shop/sell', { item, qty });
export const craftItem = (token: string, recipeId: string) => post(token, '/api/craft', { recipeId });
export const collectCraft = (token: string) => post(token, '/api/craft/collect');
export const buyLivestock = (token: string, x: number, y: number, type: string) => post(token, '/api/livestock/buy', { x, y, type });
export const collectLivestock = (token: string, x: number, y: number) => post(token, '/api/livestock/collect', { x, y });
