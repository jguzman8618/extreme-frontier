// ---------- World layout ----------
// Bigger map, more room for a populated server: 16 homesteads, river
// splitting east/west with two bridge crossings.

export const MAP_W = 40;
export const MAP_H = 40;

export type Terrain = 'grass' | 'water';

const RIVER_X = [18, 19];
const BRIDGES = [6, 24];

export function terrainAt(x: number, y: number): Terrain {
  const inRiver = x >= RIVER_X[0] && x <= RIVER_X[1];
  if (inRiver && !BRIDGES.includes(y)) return 'water';
  return 'grass';
}

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  return terrainAt(x, y) !== 'water';
}

// ---------- Homestead plots ----------
// Three sizes at three price points: Small (3x3) is what starting coins
// cover; Medium (5x5) and Large (7x7) require actually earning more.
// 16 plots total: 8 small, 6 medium, 2 large, mirrored west/east.

export interface PlotConfig {
  id: string;
  x: number;
  y: number;
  size: number;
}

export const PLOTS: PlotConfig[] = [
  { id: 'plot1', x: 2, y: 1, size: 3 }, { id: 'plot2', x: 9, y: 1, size: 5 },
  { id: 'plot3', x: 22, y: 1, size: 5 }, { id: 'plot4', x: 29, y: 1, size: 3 },
  { id: 'plot5', x: 2, y: 8, size: 5 }, { id: 'plot6', x: 9, y: 8, size: 3 },
  { id: 'plot7', x: 22, y: 8, size: 3 }, { id: 'plot8', x: 29, y: 8, size: 7 },
  { id: 'plot9', x: 2, y: 17, size: 3 }, { id: 'plot10', x: 9, y: 17, size: 7 },
  { id: 'plot11', x: 22, y: 17, size: 5 }, { id: 'plot12', x: 29, y: 17, size: 3 },
  { id: 'plot13', x: 2, y: 26, size: 5 }, { id: 'plot14', x: 9, y: 26, size: 3 },
  { id: 'plot15', x: 22, y: 26, size: 3 }, { id: 'plot16', x: 29, y: 26, size: 5 },
  { id: 'plot17', x: 2, y: 33, size: 3 }, { id: 'plot18', x: 9, y: 33, size: 5 },
  { id: 'plot19', x: 22, y: 33, size: 5 }, { id: 'plot20', x: 29, y: 33, size: 3 },
];

// ---------- Homestead pricing tiers ----------
// Keyed by plot size. Smallest tier matches starting coins exactly —
// everything bigger has to be earned. Homesteads can never be sold once
// bought; the client is required to show that plainly before purchase.

export const HOMESTEAD_TIERS: Record<number, { label: string; cost: number }> = {
  3: { label: 'Small', cost: 1000 },
  5: { label: 'Medium', cost: 2500 },
  7: { label: 'Large', cost: 5000 },
};
export const MAX_HOMESTEADS_PER_PLAYER = 3;

export function plotAt(x: number, y: number): PlotConfig | undefined {
  return PLOTS.find((p) => x >= p.x && x < p.x + p.size && y >= p.y && y < p.y + p.size);
}

export function plotCenter(p: PlotConfig): { x: number; y: number } {
  const c = Math.floor(p.size / 2);
  return { x: p.x + c, y: p.y + c };
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

// Placed in the gaps between homestead rows/columns — verified clear of
// every plot and the river. Respawn times are deliberately long — this is
// a long-term game, not a fast-money one. Stone is scarcer than wood.
export const RESOURCE_NODES: ResourceNodeConfig[] = [
  { id: 'tree1', x: 2, y: 5, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree2', x: 14, y: 5, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree3', x: 31, y: 5, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree4', x: 2, y: 15, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree5', x: 14, y: 15, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree6', x: 31, y: 15, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree7', x: 2, y: 25, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree8', x: 14, y: 25, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree9', x: 31, y: 25, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree10', x: 2, y: 38, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree11', x: 14, y: 35, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree12', x: 31, y: 38, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree13', x: 8, y: 5, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'tree14', x: 20, y: 5, type: 'wood', respawnMs: 180_000, yieldAmount: 2 },
  { id: 'rock1', x: 20, y: 15, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock2', x: 37, y: 5, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock3', x: 25, y: 15, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock4', x: 37, y: 15, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock5', x: 8, y: 25, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock6', x: 20, y: 25, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock7', x: 25, y: 25, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock8', x: 37, y: 25, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock9', x: 8, y: 35, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock10', x: 20, y: 35, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock11', x: 25, y: 38, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock12', x: 37, y: 35, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock13', x: 24, y: 6, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
  { id: 'rock14', x: 6, y: 24, type: 'stone', respawnMs: 300_000, yieldAmount: 1 },
];

export const SHOP_LOCATION = { x: 16, y: 12, size: 2 };

function insideShop(x: number, y: number): boolean {
  return x >= SHOP_LOCATION.x && x < SHOP_LOCATION.x + SHOP_LOCATION.size &&
    y >= SHOP_LOCATION.y && y < SHOP_LOCATION.y + SHOP_LOCATION.size;
}

// Resource nodes relocate to a new random clear spot each time they're
// depleted, instead of always respawning in the same place.
export function randomFreeResourceSpot(occupied: (x: number, y: number) => boolean): { x: number; y: number } {
  for (let attempt = 0; attempt < 500; attempt++) {
    const x = 1 + Math.floor(Math.random() * (MAP_W - 2));
    const y = 1 + Math.floor(Math.random() * (MAP_H - 2));
    if (!isWalkable(x, y)) continue;
    if (plotAt(x, y)) continue;
    if (insideShop(x, y)) continue;
    if (occupied(x, y)) continue;
    return { x, y };
  }
  return { x: RESOURCE_NODES[0].x, y: RESOURCE_NODES[0].y };
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
  wheat: { id: 'wheat', name: 'Wheat', icon: '🌾', growTimeMs: 300_000, yieldAmount: 3 },
  corn: { id: 'corn', name: 'Corn', icon: '🌽', growTimeMs: 600_000, yieldAmount: 4 },
  potato: { id: 'potato', name: 'Potato', icon: '🥔', growTimeMs: 900_000, yieldAmount: 6 },
};

// ---------- Buildings (placed on your own plot) ----------
// Cabin unlocks the plot — nothing else works until one is built. Shed
// unlocks farming; Barn unlocks livestock.

export interface BuildingConfig {
  id: string;
  name: string;
  icon: string;
  cost: Partial<Record<'wood' | 'stone', number>>;
}

export const BUILDINGS: Record<string, BuildingConfig> = {
  cabin: { id: 'cabin', name: 'Cabin', icon: '🛖', cost: { wood: 10 } },
  shed: { id: 'shed', name: 'Shed', icon: '🏠', cost: { wood: 6, stone: 2 } },
  barn: { id: 'barn', name: 'Barn', icon: '🏚️', cost: { wood: 8, stone: 4 } },
  fence: { id: 'fence', name: 'Fence', icon: '🚧', cost: { wood: 2 } },
  well: { id: 'well', name: 'Well', icon: '⛲', cost: { stone: 6 } },
};

// ---------- Livestock (kept on your plot once you have a Barn) ----------

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

export const LIVESTOCK: Record<string, LivestockConfig> = {
  chicken: { id: 'chicken', name: 'Chicken', icon: '🐔', cost: 20, produceItem: 'egg', produceIcon: '🥚', produceQty: 2, produceTimeMs: 45_000 },
  sheep: { id: 'sheep', name: 'Sheep', icon: '🐑', cost: 22, produceItem: 'wool', produceIcon: '🧶', produceQty: 2, produceTimeMs: 45_000 },
  cow: { id: 'cow', name: 'Cow', icon: '🐄', cost: 30, produceItem: 'milk', produceIcon: '🥛', produceQty: 2, produceTimeMs: 60_000 },
};

export const STARTING_INVENTORY: Record<string, number> = { wood: 5, stone: 2, coin: 1000 };

// ---------- Crafting (turn raw resources/crops/animal goods into sellable items) ----------

export interface CraftRecipeConfig {
  id: string;
  name: string;
  icon: string;
  category: 'food' | 'goods';
  inputs: Record<string, number>;
  outputQty: number;
  craftTimeMs: number;
}

export const CRAFT_RECIPES: Record<string, CraftRecipeConfig> = {
  // --- Tier 1: one resource type ---
  tools: { id: 'tools', name: 'Tools', icon: '🛠️', category: 'goods', inputs: { wood: 3, stone: 2 }, outputQty: 1, craftTimeMs: 180_000 },
  bread: { id: 'bread', name: 'Bread', icon: '🍞', category: 'food', inputs: { wheat: 3 }, outputQty: 2, craftTimeMs: 60_000 },
  furniture: { id: 'furniture', name: 'Furniture', icon: '🪑', category: 'goods', inputs: { wood: 6 }, outputQty: 1, craftTimeMs: 240_000 },
  cheese: { id: 'cheese', name: 'Cheese', icon: '🧀', category: 'food', inputs: { milk: 2 }, outputQty: 1, craftTimeMs: 60_000 },
  yarn: { id: 'yarn', name: 'Yarn', icon: '🧵', category: 'goods', inputs: { wool: 2 }, outputQty: 1, craftTimeMs: 60_000 },
  omelette: { id: 'omelette', name: 'Omelette', icon: '🍳', category: 'food', inputs: { egg: 2 }, outputQty: 1, craftTimeMs: 60_000 },
  cornbread: { id: 'cornbread', name: 'Cornbread', icon: '🌽', category: 'food', inputs: { corn: 3 }, outputQty: 2, craftTimeMs: 90_000 },
  fries: { id: 'fries', name: 'Fries', icon: '🍟', category: 'food', inputs: { potato: 3 }, outputQty: 2, craftTimeMs: 90_000 },

  // --- Tier 2: multiple different materials — worth trading for ---
  wagonWheel: { id: 'wagonWheel', name: 'Wagon Wheel', icon: '🛞', category: 'goods', inputs: { wood: 4, stone: 3 }, outputQty: 1, craftTimeMs: 300_000 },
  toolbox: { id: 'toolbox', name: 'Toolbox', icon: '🧰', category: 'goods', inputs: { tools: 2, furniture: 1 }, outputQty: 1, craftTimeMs: 480_000 },
  feast: { id: 'feast', name: 'Feast', icon: '🍲', category: 'food', inputs: { bread: 2, cheese: 1, omelette: 1 }, outputQty: 1, craftTimeMs: 180_000 },
};

// ---------- General Store ----------
// Base prices before supply/demand adjustment. Crafted goods sell for
// real money; raw crops too but only 1 coin each. Tools/Furniture/Wagon
// Wheel/Toolbox were previously too cheap to make and sold for too much —
// lowered now that crafting actually costs real time.

export const SELL_PRICES: Record<string, number> = {
  tools: 2,
  bread: 1,
  furniture: 1,
  cheese: 2,
  yarn: 1,
  omelette: 1,
  cornbread: 2,
  fries: 2,
  wheat: 1,
  corn: 1,
  potato: 1,
  wagonWheel: 3,
  toolbox: 6,
  feast: 12,
};

// ---------- Supply and demand ----------
// Every unit sold nudges that item's price down; it recovers back toward
// base price over real time if nobody's selling it. Keeps one player from
// crashing the market by dumping everything they made.

export const DEMAND_STEP = 3; // price drops 1 coin per this many units sold
export const DEMAND_RECOVERY_MS = 120_000; // 1 unit of "sold pressure" recovers every 2 min
