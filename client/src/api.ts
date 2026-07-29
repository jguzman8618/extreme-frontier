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

export interface ResourceNodeConfig {
  id: string;
  x: number;
  y: number;
  type: 'wood' | 'stone';
  respawnMs: number;
  yieldAmount: number;
}

export interface ResourceNodeState extends ResourceNodeConfig {
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

export interface WorldConfig {
  mapW: number;
  mapH: number;
  terrain: string[][];
  resourceNodes: ResourceNodeConfig[];
  plots: PlotConfig[];
  crops: Record<string, CropConfig>;
  buildings: Record<string, BuildingConfig>;
}

export interface CropInstance {
  x: number;
  y: number;
  ownerId: string;
  cropType: string;
  plantedAt: number;
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
  [plotId: string]: { ownerId: string; username: string };
}

export interface GameState {
  player: Player;
  inventory: Record<string, number>;
  players: PublicPlayer[];
  plotOwners: PlotOwners;
  buildings: BuildingInstance[];
  crops: CropInstance[];
  resourceNodes: ResourceNodeState[];
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
export const buildBuilding = (token: string, x: number, y: number, type: string) => post(token, '/api/buildings', { x, y, type });
export const plantCrop = (token: string, x: number, y: number, cropType: string) => post(token, '/api/crops/plant', { x, y, cropType });
export const harvestCrop = (token: string, x: number, y: number) => post(token, '/api/crops/harvest', { x, y });
