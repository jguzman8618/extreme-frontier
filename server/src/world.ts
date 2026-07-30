// ---------- Biome architecture ----------
// The game world is made of separate biome maps connected by doors at the
// midpoint of each map's north/south/east/west edge. Only the door
// directions listed in a biome's `doors` actually connect anywhere — the
// rest are reserved for biomes not built yet. Coordinates are only
// meaningful within a single biome; the same (x,y) exists independently
// in every biome.

export type BiomeId = 'homestead' | 'shop';
export type Direction = 'north' | 'south' | 'east' | 'west';
export type Terrain = 'grass' | 'water';

export interface PlotConfig {
  id: string;
  x: number;
  y: number;
  size: number;
}

export interface ResourceNodeConfig {
  id: string;
  x: number;
  y: number;
  type: 'wood' | 'stone';
  respawnMs: number;
  yieldAmount: number;
}

export interface DecorationConfig {
  x: number;
  y: number;
  icon: string;
  blocking: boolean;
}

export interface BuildingFootprint {
  x: number;
  y: number;
  w: number;
  h: number;
  icon: string;
}

export interface BiomeConfig {
  id: BiomeId;
  name: string;
  mapW: number;
  mapH: number;
  terrainAt: (x: number, y: number) => Terrain;
  plots: PlotConfig[];
  resourceNodes: ResourceNodeConfig[];
  decorations: DecorationConfig[];
  paths: { x: number; y: number }[];
  doors: Partial<Record<Direction, BiomeId>>;
  homesteadsAllowed: boolean;
  building?: BuildingFootprint;
}

const OPPOSITE: Record<Direction, Direction> = { north: 'south', south: 'north', east: 'west', west: 'east' };
export function oppositeDirection(dir: Direction): Direction {
  return OPPOSITE[dir];
}

export function doorPosition(biome: BiomeConfig, dir: Direction): { x: number; y: number } {
  const midX = Math.floor(biome.mapW / 2);
  const midY = Math.floor(biome.mapH / 2);
  if (dir === 'north') return { x: midX, y: 0 };
  if (dir === 'south') return { x: midX, y: biome.mapH - 1 };
  if (dir === 'west') return { x: 0, y: midY };
  return { x: biome.mapW - 1, y: midY };
}

// ==================== HOMESTEAD BIOME ====================
// The starting biome — old-west homestead sim. This is the center of the
// eventual 3x3 biome grid; a door on its east edge leads to the Shop.

const HOME_MAP_W = 40;
const HOME_MAP_H = 40;
const HOME_BRIDGES = [6, 24];

function homeRiverCenterX(y: number): number {
  return 18 + Math.round(1.5 * Math.sin((y / HOME_MAP_H) * Math.PI * 2));
}

function homesteadTerrainAt(x: number, y: number): Terrain {
  const cx = homeRiverCenterX(y);
  const inRiver = x === cx || x === cx + 1;
  if (inRiver && !HOME_BRIDGES.includes(y)) return 'water';
  return 'grass';
}

export const HOMESTEAD_PLOTS: PlotConfig[] = [
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

export const HOMESTEAD_TIERS: Record<number, { label: string; cost: number }> = {
  3: { label: 'Small', cost: 1000 },
  5: { label: 'Medium', cost: 2500 },
  7: { label: 'Large', cost: 5000 },
};
export const MAX_HOMESTEADS_PER_PLAYER = 3;

export const HOMESTEAD_RESOURCE_NODES: ResourceNodeConfig[] = [
  { id: 'tree1', x: 2, y: 5, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree2', x: 14, y: 5, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree3', x: 31, y: 5, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree4', x: 2, y: 15, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree5', x: 14, y: 15, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree6', x: 31, y: 15, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree7', x: 2, y: 25, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree8', x: 14, y: 25, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree9', x: 31, y: 25, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree10', x: 2, y: 38, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree11', x: 14, y: 35, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree12', x: 31, y: 38, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree13', x: 8, y: 5, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree14', x: 16, y: 5, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'rock1', x: 17, y: 15, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock2', x: 37, y: 5, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock3', x: 25, y: 15, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock4', x: 37, y: 15, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock5', x: 8, y: 25, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock6', x: 20, y: 25, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock7', x: 25, y: 25, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock8', x: 37, y: 25, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock9', x: 8, y: 35, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock10', x: 20, y: 35, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock11', x: 25, y: 38, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock12', x: 37, y: 35, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock13', x: 24, y: 6, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock14', x: 6, y: 24, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
];

export const HOMESTEAD_BIOME: BiomeConfig = {
  id: 'homestead',
  name: 'Homestead',
  mapW: HOME_MAP_W,
  mapH: HOME_MAP_H,
  terrainAt: homesteadTerrainAt,
  plots: HOMESTEAD_PLOTS,
  resourceNodes: HOMESTEAD_RESOURCE_NODES,
  decorations: [],
  paths: [],
  doors: { east: 'shop' },
  homesteadsAllowed: true,
};

// ==================== SHOP BIOME ====================
// A dedicated plaza biome with its own harvestable wood/stone (worth the
// trip out from the Homestead), a large shop building, a walkway to its
// front door, and a decorative pond with a winding stream.

const SHOP_MAP_W = 40;
const SHOP_MAP_H = 40;

// Building footprint (blocks movement) — the door itself is a separate
// interactive tile just outside it, not part of the solid block.
const SHOP_BUILDING = { x: 16, y: 11, w: 7, h: 7 };
export const SHOP_DOOR = { x: 19, y: 18 }; // just south of the building

function buildShopPond(): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  const cx = 31, cy = 7, r = 3;
  for (let x = cx - r; x <= cx + r; x++) {
    for (let y = cy - r; y <= cy + r; y++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r + 0.5) tiles.push({ x, y });
    }
  }
  return tiles;
}

function buildShopStream(): { x: number; y: number }[] {
  // Exits the pond's south-east edge and curves distinctly right away,
  // rather than continuing straight down from the pond's center.
  const tiles: { x: number; y: number }[] = [];
  let x = 34, y = 9;
  const moves: [number, number][] = [
    [1, 1], [1, 1], [0, 1], [-1, 1], [-1, 1], [0, 1],
    [1, 1], [1, 1], [0, 1], [-1, 1], [-1, 1], [0, 1], [1, 1], [0, 1],
  ];
  for (const [dx, dy] of moves) {
    x += dx; y += dy;
    tiles.push({ x, y });
  }
  return tiles;
}

const SHOP_WATER = [...buildShopPond(), ...buildShopStream()];
const SHOP_WATER_SET = new Set(SHOP_WATER.map((t) => `${t.x},${t.y}`));

function shopTerrainAt(x: number, y: number): Terrain {
  return SHOP_WATER_SET.has(`${x},${y}`) ? 'water' : 'grass';
}

function buildShopDecorations(): DecorationConfig[] {
  const deco: DecorationConfig[] = [];
  // Scenery around the pond, plus a windmill landmark.
  const trees = [[27, 5], [35, 5], [27, 10], [37, 10]];
  const rocks = [[29, 3], [33, 11]];
  for (const [x, y] of trees) deco.push({ x, y, icon: '🌳', blocking: true });
  for (const [x, y] of rocks) deco.push({ x, y, icon: '🪨', blocking: true });
  deco.push({ x: 8, y: 8, icon: '🗼', blocking: true });
  return deco;
}

function buildShopPaths(): { x: number; y: number }[] {
  const paths: { x: number; y: number }[] = [];
  // Straight walkway from the west arrival door to the building's front door.
  for (let x = 0; x <= SHOP_DOOR.x; x++) paths.push({ x, y: SHOP_DOOR.y });
  return paths;
}

export const SHOP_RESOURCE_NODES: ResourceNodeConfig[] = [
  { id: 'shop_tree1', x: 5, y: 25, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree2', x: 10, y: 32, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree3', x: 25, y: 32, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree4', x: 35, y: 30, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree5', x: 3, y: 15, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree6', x: 36, y: 20, type: 'wood', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_rock1', x: 8, y: 28, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock2', x: 20, y: 35, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock3', x: 30, y: 35, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock4', x: 5, y: 10, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock5', x: 12, y: 5, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock6', x: 36, y: 25, type: 'stone', respawnMs: 90_000, yieldAmount: 1 },
];

export const SHOP_BIOME: BiomeConfig = {
  id: 'shop',
  name: 'General Store',
  mapW: SHOP_MAP_W,
  mapH: SHOP_MAP_H,
  terrainAt: shopTerrainAt,
  plots: [],
  resourceNodes: SHOP_RESOURCE_NODES,
  decorations: buildShopDecorations(),
  paths: buildShopPaths(),
  doors: { west: 'homestead' },
  homesteadsAllowed: false,
  building: { ...SHOP_BUILDING, icon: '🏪' },
};

export const BIOMES: Record<BiomeId, BiomeConfig> = {
  homestead: HOMESTEAD_BIOME,
  shop: SHOP_BIOME,
};

export function isInsideBuilding(x: number, y: number, b: { x: number; y: number; w: number; h: number }): boolean {
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

export function plotAt(biome: BiomeId, x: number, y: number): PlotConfig | undefined {
  return BIOMES[biome].plots.find((p) => x >= p.x && x < p.x + p.size && y >= p.y && y < p.y + p.size);
}

export function plotCenter(p: PlotConfig): { x: number; y: number } {
  const c = Math.floor(p.size / 2);
  return { x: p.x + c, y: p.y + c };
}

export function isWalkable(biome: BiomeId, x: number, y: number): boolean {
  const b = BIOMES[biome];
  if (x < 0 || y < 0 || x >= b.mapW || y >= b.mapH) return false;
  if (b.terrainAt(x, y) === 'water') return false;
  if (biome === 'shop' && isInsideBuilding(x, y, SHOP_BUILDING)) return false;
  if (b.decorations.some((d) => d.blocking && d.x === x && d.y === y)) return false;
  return true;
}

export function randomFreeResourceSpot(biome: BiomeId, occupied: (x: number, y: number) => boolean): { x: number; y: number } {
  const b = BIOMES[biome];
  for (let attempt = 0; attempt < 500; attempt++) {
    const x = 1 + Math.floor(Math.random() * (b.mapW - 2));
    const y = 1 + Math.floor(Math.random() * (b.mapH - 2));
    if (!isWalkable(biome, x, y)) continue;
    if (plotAt(biome, x, y)) continue;
    if (occupied(x, y)) continue;
    return { x, y };
  }
  const fallback = b.resourceNodes[0];
  return { x: fallback.x, y: fallback.y };
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

// ---------- Crafting ----------

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
  tools: { id: 'tools', name: 'Tools', icon: '🛠️', category: 'goods', inputs: { wood: 3, stone: 2 }, outputQty: 1, craftTimeMs: 45_000 },
  bread: { id: 'bread', name: 'Bread', icon: '🍞', category: 'food', inputs: { wheat: 3 }, outputQty: 2, craftTimeMs: 20_000 },
  furniture: { id: 'furniture', name: 'Furniture', icon: '🪑', category: 'goods', inputs: { wood: 6 }, outputQty: 1, craftTimeMs: 45_000 },
  cheese: { id: 'cheese', name: 'Cheese', icon: '🧀', category: 'food', inputs: { milk: 2 }, outputQty: 1, craftTimeMs: 20_000 },
  yarn: { id: 'yarn', name: 'Yarn', icon: '🧵', category: 'goods', inputs: { wool: 2 }, outputQty: 1, craftTimeMs: 20_000 },
  omelette: { id: 'omelette', name: 'Omelette', icon: '🍳', category: 'food', inputs: { egg: 2 }, outputQty: 1, craftTimeMs: 20_000 },
  cornbread: { id: 'cornbread', name: 'Cornbread', icon: '🌽', category: 'food', inputs: { corn: 3 }, outputQty: 2, craftTimeMs: 30_000 },
  fries: { id: 'fries', name: 'Fries', icon: '🍟', category: 'food', inputs: { potato: 3 }, outputQty: 2, craftTimeMs: 30_000 },
  wagonWheel: { id: 'wagonWheel', name: 'Wagon Wheel', icon: '🛞', category: 'goods', inputs: { wood: 4, stone: 3 }, outputQty: 1, craftTimeMs: 60_000 },
  toolbox: { id: 'toolbox', name: 'Toolbox', icon: '🧰', category: 'goods', inputs: { tools: 2, furniture: 1 }, outputQty: 1, craftTimeMs: 90_000 },
  feast: { id: 'feast', name: 'Feast', icon: '🍲', category: 'food', inputs: { bread: 2, cheese: 1, omelette: 1 }, outputQty: 1, craftTimeMs: 75_000 },
};

// ---------- General Store (only usable while in the Shop biome) ----------

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

export const DEMAND_STEP = 3;
export const DEMAND_RECOVERY_MS = 120_000;
