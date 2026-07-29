// ---------- World layout ----------
// Small, fixed, hand-placed map. No procedural generation — every tile's
// position is deliberate so the world is legible at this size. Grows later.

export const MAP_W = 20;
export const MAP_H = 20;

export type Terrain = 'grass' | 'water';

// A river splits the map north-south, columns 9-10, with two bridge
// crossings so it's a landmark, not just an obstacle.
export function terrainAt(x: number, y: number): Terrain {
  const inRiver = x >= 9 && x <= 10;
  const isBridge = y === 4 || y === 15;
  if (inRiver && !isBridge) return 'water';
  return 'grass';
}

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  return terrainAt(x, y) !== 'water';
}

// ---------- Gatherable resource nodes ----------

export type ResourceType = 'wood' | 'stone';

export interface ResourceNodeConfig {
  id: string;
  x: number;
  y: number;
  type: ResourceType;
  respawnMs: number;
  yieldAmount: number;
}

export const RESOURCE_NODES: ResourceNodeConfig[] = [
  { id: 'tree1', x: 2, y: 2, type: 'wood', respawnMs: 20_000, yieldAmount: 2 },
  { id: 'tree2', x: 3, y: 5, type: 'wood', respawnMs: 20_000, yieldAmount: 2 },
  { id: 'tree3', x: 16, y: 3, type: 'wood', respawnMs: 20_000, yieldAmount: 2 },
  { id: 'tree4', x: 17, y: 17, type: 'wood', respawnMs: 20_000, yieldAmount: 2 },
  { id: 'tree5', x: 1, y: 17, type: 'wood', respawnMs: 20_000, yieldAmount: 2 },
  { id: 'rock1', x: 5, y: 12, type: 'stone', respawnMs: 30_000, yieldAmount: 2 },
  { id: 'rock2', x: 14, y: 8, type: 'stone', respawnMs: 30_000, yieldAmount: 2 },
  { id: 'rock3', x: 12, y: 18, type: 'stone', respawnMs: 30_000, yieldAmount: 2 },
];

// ---------- Homestead plots ----------
// Fixed 3x3 claimable plots scattered away from the river and resource nodes.

export interface PlotConfig {
  id: string;
  x: number; // top-left corner
  y: number;
  size: number;
}

export const PLOTS: PlotConfig[] = [
  { id: 'plot1', x: 3, y: 0, size: 3 },
  { id: 'plot2', x: 14, y: 0, size: 3 },
  { id: 'plot3', x: 3, y: 9, size: 3 },
  { id: 'plot4', x: 14, y: 9, size: 3 },
  { id: 'plot5', x: 3, y: 16, size: 3 },
  { id: 'plot6', x: 14, y: 16, size: 3 },
];

export function plotAt(x: number, y: number): PlotConfig | undefined {
  return PLOTS.find((p) => x >= p.x && x < p.x + p.size && y >= p.y && y < p.y + p.size);
}

export function plotCenter(p: PlotConfig): { x: number; y: number } {
  const c = Math.floor(p.size / 2);
  return { x: p.x + c, y: p.y + c };
}

// ---------- Crops (planted on your own plot's soil tiles) ----------

export interface CropConfig {
  id: string;
  name: string;
  icon: string;
  growTimeMs: number;
  yieldAmount: number;
}

export const CROPS: Record<string, CropConfig> = {
  wheat: { id: 'wheat', name: 'Wheat', icon: '🌾', growTimeMs: 30_000, yieldAmount: 3 },
  corn: { id: 'corn', name: 'Corn', icon: '🌽', growTimeMs: 60_000, yieldAmount: 4 },
  potato: { id: 'potato', name: 'Potato', icon: '🥔', growTimeMs: 90_000, yieldAmount: 6 },
};

// ---------- Buildings (placed on your own plot) ----------

export interface BuildingConfig {
  id: string;
  name: string;
  icon: string;
  cost: Partial<Record<'wood' | 'stone', number>>;
}

export const BUILDINGS: Record<string, BuildingConfig> = {
  cabin: { id: 'cabin', name: 'Cabin', icon: '🛖', cost: { wood: 10 } },
  barn: { id: 'barn', name: 'Barn', icon: '🏚️', cost: { wood: 8, stone: 4 } },
  fence: { id: 'fence', name: 'Fence', icon: '🚧', cost: { wood: 2 } },
  well: { id: 'well', name: 'Well', icon: '⛲', cost: { stone: 6 } },
};

export const STARTING_INVENTORY: Record<string, number> = { wood: 5, stone: 2, globcoin: 50 };

// ---------- Crafting (turn raw resources/crops into sellable goods) ----------

export interface CraftRecipeConfig {
  id: string;
  name: string;
  icon: string;
  inputs: Record<string, number>;
  outputQty: number;
}

export const CRAFT_RECIPES: Record<string, CraftRecipeConfig> = {
  tools: { id: 'tools', name: 'Tools', icon: '🛠️', inputs: { wood: 3, stone: 2 }, outputQty: 1 },
  bread: { id: 'bread', name: 'Bread', icon: '🍞', inputs: { wheat: 3 }, outputQty: 2 },
  furniture: { id: 'furniture', name: 'Furniture', icon: '🪑', inputs: { wood: 6 }, outputQty: 1 },
};

// ---------- Homesteading cost ----------
// Priced so starting Glob Coins cover exactly one homestead — buying a
// second means actually earning coins first, not just claiming freely.

export const HOMESTEAD_COST = 50;

// ---------- General Store ----------
// Deliberately placed well away from every homestead plot so it's a real
// trip, not something you can sell from your own porch. Only crafted
// goods are sellable — raw gathered/farmed resources have to be turned
// into something first.

export const SHOP_LOCATION = { x: 11, y: 9 };

export const SELL_PRICES: Record<string, number> = {
  tools: 15,
  bread: 4,
  furniture: 10,
};
