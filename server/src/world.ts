// ---------- Biome architecture ----------
// The game world is made of separate biome maps connected by doors at the
// midpoint of each map's north/south/east/west edge. Only the door
// directions listed in a biome's `doors` actually connect anywhere — the
// rest are reserved for biomes not built yet. Coordinates are only
// meaningful within a single biome; the same (x,y) exists independently
// in every biome.

export type BiomeId = 'homestead' | 'shop' | 'fall' | 'snow' | 'desert';
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
  type: string;
  icon: string;
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
  allowedCrops: string[];
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
  return 18 + Math.round(2 * Math.sin((y / HOME_MAP_H) * Math.PI * 2));
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
export const HOMESTEAD_SELL_REFUND_RATE = 0.5;

export const HOMESTEAD_RESOURCE_NODES: ResourceNodeConfig[] = [
  { id: 'tree1', x: 2, y: 5, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree2', x: 14, y: 5, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree3', x: 31, y: 5, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree4', x: 2, y: 15, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree5', x: 14, y: 15, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree6', x: 31, y: 15, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree7', x: 2, y: 25, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree8', x: 14, y: 25, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree9', x: 31, y: 25, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree10', x: 2, y: 38, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree11', x: 14, y: 35, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree12', x: 31, y: 38, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree13', x: 8, y: 5, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'tree14', x: 16, y: 5, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'rock1', x: 17, y: 15, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock2', x: 37, y: 5, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock3', x: 25, y: 15, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock4', x: 37, y: 15, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock5', x: 8, y: 25, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock6', x: 20, y: 25, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock7', x: 25, y: 25, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock8', x: 37, y: 25, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock9', x: 8, y: 35, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock10', x: 20, y: 35, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock11', x: 25, y: 38, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock12', x: 37, y: 35, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock13', x: 24, y: 6, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'rock14', x: 6, y: 24, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
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
  doors: { east: 'shop', west: 'fall', north: 'snow', south: 'desert' },
  homesteadsAllowed: true,
  allowedCrops: ['wheat', 'corn', 'potato'],
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
  // Irregular, asymmetric outline — varying width AND offset per row,
  // not a formula-perfect circle.
  const rows: number[][] = [
    [30, 31],
    [28, 29, 30, 31, 32],
    [27, 28, 29, 30, 31, 32, 33],
    [28, 29, 30, 31, 32, 33, 34],
    [28, 29, 30, 31, 32, 33],
    [29, 30, 31, 32],
    [30, 31],
  ];
  const tiles: { x: number; y: number }[] = [];
  rows.forEach((cols, i) => {
    const y = 4 + i;
    cols.forEach((x) => tiles.push({ x, y }));
  });
  return tiles;
}

function buildShopStream(): { x: number; y: number }[] {
  // Manhattan path (pure horizontal/vertical runs, no diagonal steps) so
  // every consecutive tile shares a full edge and renders as one
  // continuous winding body instead of disconnected segments.
  const waypoints: [number, number][] = [
    [30, 10], [30, 13], [33, 13], [33, 17], [30, 17], [30, 21], [33, 21], [33, 23],
  ];
  const seen = new Set<string>();
  const tiles: { x: number; y: number }[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [x1, y1] = waypoints[i];
    const [x2, y2] = waypoints[i + 1];
    if (x1 === x2) {
      const [a, b] = y1 < y2 ? [y1, y2] : [y2, y1];
      for (let y = a; y <= b; y++) {
        const key = `${x1},${y}`;
        if (!seen.has(key)) { seen.add(key); tiles.push({ x: x1, y }); }
      }
    } else {
      const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
      for (let x = a; x <= b; x++) {
        const key = `${x},${y1}`;
        if (!seen.has(key)) { seen.add(key); tiles.push({ x, y: y1 }); }
      }
    }
  }
  return tiles;
}

const SHOP_WATER = [...buildShopPond(), ...buildShopStream()];
const SHOP_WATER_SET = new Set(SHOP_WATER.map((t) => `${t.x},${t.y}`));

function shopTerrainAt(x: number, y: number): Terrain {
  return SHOP_WATER_SET.has(`${x},${y}`) ? 'water' : 'grass';
}

function buildShopDecorations(): DecorationConfig[] {
  return [];
}

function buildShopPaths(): { x: number; y: number }[] {
  const paths: { x: number; y: number }[] = [];
  const arriveY = Math.floor(SHOP_MAP_H / 2); // matches doorPosition('west') exactly
  // Horizontal from the arrival door, then a bend up to the shop's front door.
  for (let x = 0; x <= SHOP_DOOR.x; x++) paths.push({ x, y: arriveY });
  const [yStart, yEnd] = SHOP_DOOR.y < arriveY ? [SHOP_DOOR.y, arriveY] : [arriveY, SHOP_DOOR.y];
  for (let y = yStart; y <= yEnd; y++) paths.push({ x: SHOP_DOOR.x, y });
  return paths;
}

export const SHOP_RESOURCE_NODES: ResourceNodeConfig[] = [
  { id: 'shop_tree1', x: 5, y: 25, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree2', x: 10, y: 32, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree3', x: 25, y: 32, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree4', x: 35, y: 30, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree5', x: 3, y: 15, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree6', x: 36, y: 20, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree7', x: 15, y: 25, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree8', x: 8, y: 35, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree9', x: 30, y: 3, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree10', x: 2, y: 5, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree11', x: 2, y: 32, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_tree12', x: 22, y: 38, type: 'wood', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'shop_rock1', x: 8, y: 28, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock2', x: 20, y: 35, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock3', x: 30, y: 35, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock4', x: 5, y: 10, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock5', x: 12, y: 5, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock6', x: 36, y: 25, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock7', x: 22, y: 25, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock8', x: 15, y: 35, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock9', x: 36, y: 10, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock10', x: 38, y: 35, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock11', x: 8, y: 3, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'shop_rock12', x: 38, y: 15, type: 'stone', icon: '🪨', respawnMs: 90_000, yieldAmount: 1 },
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
  allowedCrops: [],
  building: { ...SHOP_BUILDING, icon: '🏪' },
};


// ==================== FALL BIOME ====================
// A second homesteadable biome, reached from the Homestead's west door.
// Its own resources (Hardwood, Flint) and crops (Pumpkin, Squash,
// Cranberry) — no river, smaller than the Homestead (12 plots).

const FALL_MAP_W = 40;
const FALL_MAP_H = 40;

function fallTerrainAt(_x: number, _y: number): Terrain {
  return 'grass';
}

export const FALL_PLOTS: PlotConfig[] = [
  { id: 'fall_plot1', x: 2, y: 1, size: 3 }, { id: 'fall_plot2', x: 9, y: 1, size: 5 },
  { id: 'fall_plot3', x: 22, y: 1, size: 5 }, { id: 'fall_plot4', x: 29, y: 1, size: 3 },
  { id: 'fall_plot5', x: 2, y: 8, size: 5 }, { id: 'fall_plot6', x: 9, y: 8, size: 3 },
  { id: 'fall_plot7', x: 22, y: 8, size: 3 }, { id: 'fall_plot8', x: 29, y: 8, size: 7 },
  { id: 'fall_plot9', x: 2, y: 17, size: 3 }, { id: 'fall_plot10', x: 9, y: 17, size: 7 },
  { id: 'fall_plot11', x: 22, y: 17, size: 5 }, { id: 'fall_plot12', x: 29, y: 17, size: 3 },
  { id: 'fall_plot13', x: 2, y: 26, size: 5 }, { id: 'fall_plot14', x: 9, y: 26, size: 3 },
  { id: 'fall_plot15', x: 22, y: 26, size: 3 }, { id: 'fall_plot16', x: 29, y: 26, size: 5 },
];

export const FALL_RESOURCE_NODES: ResourceNodeConfig[] = [
  { id: 'fall_hardwood1', x: 3, y: 4, type: 'hardwood', icon: '🌳', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'fall_hardwood2', x: 8, y: 2, type: 'hardwood', icon: '🌳', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'fall_hardwood3', x: 16, y: 4, type: 'hardwood', icon: '🌳', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'fall_hardwood4', x: 21, y: 2, type: 'hardwood', icon: '🌳', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'fall_hardwood5', x: 30, y: 4, type: 'hardwood', icon: '🌳', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'fall_hardwood6', x: 36, y: 4, type: 'hardwood', icon: '🌳', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'fall_hardwood7', x: 2, y: 13, type: 'hardwood', icon: '🌳', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'fall_hardwood8', x: 10, y: 12, type: 'hardwood', icon: '🌳', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'fall_hardwood9', x: 3, y: 20, type: 'hardwood', icon: '🌳', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'fall_hardwood10', x: 8, y: 18, type: 'hardwood', icon: '🌳', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'fall_hardwood11', x: 3, y: 35, type: 'hardwood', icon: '🌳', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'fall_hardwood12', x: 10, y: 35, type: 'hardwood', icon: '🌳', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'fall_flint1', x: 16, y: 12, type: 'flint', icon: '⚫', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'fall_flint2', x: 23, y: 12, type: 'flint', icon: '⚫', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'fall_flint3', x: 28, y: 10, type: 'flint', icon: '⚫', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'fall_flint4', x: 36, y: 12, type: 'flint', icon: '⚫', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'fall_flint5', x: 16, y: 20, type: 'flint', icon: '⚫', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'fall_flint6', x: 21, y: 18, type: 'flint', icon: '⚫', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'fall_flint7', x: 30, y: 20, type: 'flint', icon: '⚫', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'fall_flint8', x: 36, y: 20, type: 'flint', icon: '⚫', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'fall_flint9', x: 16, y: 28, type: 'flint', icon: '⚫', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'fall_flint10', x: 23, y: 35, type: 'flint', icon: '⚫', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'fall_flint11', x: 30, y: 35, type: 'flint', icon: '⚫', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'fall_flint12', x: 36, y: 28, type: 'flint', icon: '⚫', respawnMs: 90_000, yieldAmount: 1 },
];

export const FALL_BIOME: BiomeConfig = {
  id: 'fall',
  name: 'Fall Valley',
  mapW: FALL_MAP_W,
  mapH: FALL_MAP_H,
  terrainAt: fallTerrainAt,
  plots: FALL_PLOTS,
  resourceNodes: FALL_RESOURCE_NODES,
  decorations: [],
  paths: [],
  doors: { east: 'homestead' },
  homesteadsAllowed: true,
  allowedCrops: ['pumpkin', 'squash', 'cranberry'],
};


// ==================== SNOW BIOME ====================
// A third homesteadable biome, reached from the Homestead's north door.
// Its own resources (Pine, Ice) and crops (Carrot, Cabbage, Turnip).

const SNOW_MAP_W = 40;
const SNOW_MAP_H = 40;

function snowTerrainAt(_x: number, _y: number): Terrain {
  return 'grass';
}

export const SNOW_PLOTS: PlotConfig[] = [
  { id: 'snow_plot1', x: 2, y: 1, size: 3 }, { id: 'snow_plot2', x: 9, y: 1, size: 5 },
  { id: 'snow_plot3', x: 22, y: 1, size: 5 }, { id: 'snow_plot4', x: 29, y: 1, size: 3 },
  { id: 'snow_plot5', x: 2, y: 8, size: 5 }, { id: 'snow_plot6', x: 9, y: 8, size: 3 },
  { id: 'snow_plot7', x: 22, y: 8, size: 3 }, { id: 'snow_plot8', x: 29, y: 8, size: 7 },
  { id: 'snow_plot9', x: 2, y: 17, size: 3 }, { id: 'snow_plot10', x: 9, y: 17, size: 7 },
  { id: 'snow_plot11', x: 22, y: 17, size: 5 }, { id: 'snow_plot12', x: 29, y: 17, size: 3 },
  { id: 'snow_plot13', x: 2, y: 26, size: 5 }, { id: 'snow_plot14', x: 9, y: 26, size: 3 },
  { id: 'snow_plot15', x: 22, y: 26, size: 3 }, { id: 'snow_plot16', x: 29, y: 26, size: 5 },
];

export const SNOW_RESOURCE_NODES: ResourceNodeConfig[] = [
  { id: 'snow_pine1', x: 3, y: 4, type: 'pine', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'snow_pine2', x: 8, y: 2, type: 'pine', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'snow_pine3', x: 16, y: 4, type: 'pine', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'snow_pine4', x: 21, y: 2, type: 'pine', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'snow_pine5', x: 30, y: 4, type: 'pine', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'snow_pine6', x: 36, y: 4, type: 'pine', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'snow_pine7', x: 2, y: 13, type: 'pine', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'snow_pine8', x: 10, y: 12, type: 'pine', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'snow_pine9', x: 3, y: 20, type: 'pine', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'snow_pine10', x: 8, y: 18, type: 'pine', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'snow_pine11', x: 1, y: 26, type: 'pine', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'snow_pine12', x: 9, y: 29, type: 'pine', icon: '🌲', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'snow_ice1', x: 16, y: 12, type: 'ice', icon: '🧊', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'snow_ice2', x: 23, y: 12, type: 'ice', icon: '🧊', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'snow_ice3', x: 28, y: 10, type: 'ice', icon: '🧊', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'snow_ice4', x: 36, y: 12, type: 'ice', icon: '🧊', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'snow_ice5', x: 16, y: 20, type: 'ice', icon: '🧊', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'snow_ice6', x: 21, y: 18, type: 'ice', icon: '🧊', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'snow_ice7', x: 30, y: 20, type: 'ice', icon: '🧊', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'snow_ice8', x: 36, y: 20, type: 'ice', icon: '🧊', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'snow_ice9', x: 16, y: 28, type: 'ice', icon: '🧊', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'snow_ice10', x: 22, y: 29, type: 'ice', icon: '🧊', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'snow_ice11', x: 28, y: 26, type: 'ice', icon: '🧊', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'snow_ice12', x: 36, y: 28, type: 'ice', icon: '🧊', respawnMs: 90_000, yieldAmount: 1 },
];

export const SNOW_BIOME: BiomeConfig = {
  id: 'snow',
  name: 'Snowpeak',
  mapW: SNOW_MAP_W,
  mapH: SNOW_MAP_H,
  terrainAt: snowTerrainAt,
  plots: SNOW_PLOTS,
  resourceNodes: SNOW_RESOURCE_NODES,
  decorations: [],
  paths: [],
  doors: { south: 'homestead' },
  homesteadsAllowed: true,
  allowedCrops: ['carrot', 'cabbage', 'turnip'],
};


// ==================== DESERT BIOME ====================
// A fourth homesteadable biome, reached from the Homestead's south door.
// Its own resources (Cactus, Sandstone) and crops (Melon, Pepper, Onion).

const DESERT_MAP_W = 40;
const DESERT_MAP_H = 40;

function desertTerrainAt(_x: number, _y: number): Terrain {
  return 'grass';
}

export const DESERT_PLOTS: PlotConfig[] = [
  { id: 'desert_plot1', x: 2, y: 1, size: 3 }, { id: 'desert_plot2', x: 9, y: 1, size: 5 },
  { id: 'desert_plot3', x: 22, y: 1, size: 5 }, { id: 'desert_plot4', x: 29, y: 1, size: 3 },
  { id: 'desert_plot5', x: 2, y: 8, size: 5 }, { id: 'desert_plot6', x: 9, y: 8, size: 3 },
  { id: 'desert_plot7', x: 22, y: 8, size: 3 }, { id: 'desert_plot8', x: 29, y: 8, size: 7 },
  { id: 'desert_plot9', x: 2, y: 17, size: 3 }, { id: 'desert_plot10', x: 9, y: 17, size: 7 },
  { id: 'desert_plot11', x: 22, y: 17, size: 5 }, { id: 'desert_plot12', x: 29, y: 17, size: 3 },
  { id: 'desert_plot13', x: 2, y: 26, size: 5 }, { id: 'desert_plot14', x: 9, y: 26, size: 3 },
  { id: 'desert_plot15', x: 22, y: 26, size: 3 }, { id: 'desert_plot16', x: 29, y: 26, size: 5 },
];

export const DESERT_RESOURCE_NODES: ResourceNodeConfig[] = [
  { id: 'desert_cactus1', x: 3, y: 4, type: 'cactus', icon: '🌵', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'desert_cactus2', x: 8, y: 2, type: 'cactus', icon: '🌵', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'desert_cactus3', x: 16, y: 4, type: 'cactus', icon: '🌵', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'desert_cactus4', x: 21, y: 2, type: 'cactus', icon: '🌵', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'desert_cactus5', x: 30, y: 4, type: 'cactus', icon: '🌵', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'desert_cactus6', x: 36, y: 4, type: 'cactus', icon: '🌵', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'desert_cactus7', x: 2, y: 13, type: 'cactus', icon: '🌵', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'desert_cactus8', x: 10, y: 12, type: 'cactus', icon: '🌵', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'desert_cactus9', x: 3, y: 20, type: 'cactus', icon: '🌵', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'desert_cactus10', x: 8, y: 18, type: 'cactus', icon: '🌵', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'desert_cactus11', x: 1, y: 26, type: 'cactus', icon: '🌵', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'desert_cactus12', x: 9, y: 29, type: 'cactus', icon: '🌵', respawnMs: 45_000, yieldAmount: 2 },
  { id: 'desert_sandstone1', x: 16, y: 12, type: 'sandstone', icon: '🧱', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'desert_sandstone2', x: 23, y: 12, type: 'sandstone', icon: '🧱', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'desert_sandstone3', x: 28, y: 10, type: 'sandstone', icon: '🧱', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'desert_sandstone4', x: 36, y: 12, type: 'sandstone', icon: '🧱', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'desert_sandstone5', x: 16, y: 20, type: 'sandstone', icon: '🧱', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'desert_sandstone6', x: 21, y: 18, type: 'sandstone', icon: '🧱', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'desert_sandstone7', x: 30, y: 20, type: 'sandstone', icon: '🧱', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'desert_sandstone8', x: 36, y: 20, type: 'sandstone', icon: '🧱', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'desert_sandstone9', x: 16, y: 28, type: 'sandstone', icon: '🧱', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'desert_sandstone10', x: 22, y: 29, type: 'sandstone', icon: '🧱', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'desert_sandstone11', x: 28, y: 26, type: 'sandstone', icon: '🧱', respawnMs: 90_000, yieldAmount: 1 },
  { id: 'desert_sandstone12', x: 36, y: 28, type: 'sandstone', icon: '🧱', respawnMs: 90_000, yieldAmount: 1 },
];

export const DESERT_BIOME: BiomeConfig = {
  id: 'desert',
  name: 'Sandscar Desert',
  mapW: DESERT_MAP_W,
  mapH: DESERT_MAP_H,
  terrainAt: desertTerrainAt,
  plots: DESERT_PLOTS,
  resourceNodes: DESERT_RESOURCE_NODES,
  decorations: [],
  paths: [],
  doors: { north: 'homestead' },
  homesteadsAllowed: true,
  allowedCrops: ['melon', 'pepper', 'onion'],
};

export const BIOMES: Record<BiomeId, BiomeConfig> = {
  homestead: HOMESTEAD_BIOME,
  shop: SHOP_BIOME,
  fall: FALL_BIOME,
  snow: SNOW_BIOME,
  desert: DESERT_BIOME,
};

export const MATERIAL_ICONS: Record<string, string> = {};
for (const biome of Object.values(BIOMES)) {
  for (const n of biome.resourceNodes) MATERIAL_ICONS[n.type] = n.icon;
}

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
  plantCost: number;
}

export const CROPS: Record<string, CropConfig> = {
  wheat: { id: 'wheat', name: 'Wheat', icon: '🌾', growTimeMs: 30_000, yieldAmount: 3, plantCost: 3 },
  corn: { id: 'corn', name: 'Corn', icon: '🌽', growTimeMs: 60_000, yieldAmount: 4, plantCost: 5 },
  potato: { id: 'potato', name: 'Potato', icon: '🥔', growTimeMs: 90_000, yieldAmount: 6, plantCost: 8 },
  squash: { id: 'squash', name: 'Squash', icon: '🥒', growTimeMs: 30_000, yieldAmount: 3, plantCost: 3 },
  cranberry: { id: 'cranberry', name: 'Cranberry', icon: '🔴', growTimeMs: 60_000, yieldAmount: 4, plantCost: 5 },
  carrot: { id: 'carrot', name: 'Carrot', icon: '🥕', growTimeMs: 30_000, yieldAmount: 3, plantCost: 3 },
  cabbage: { id: 'cabbage', name: 'Cabbage', icon: '🥬', growTimeMs: 60_000, yieldAmount: 4, plantCost: 5 },
  turnip: { id: 'turnip', name: 'Turnip', icon: '🫜', growTimeMs: 90_000, yieldAmount: 6, plantCost: 8 },
  onion: { id: 'onion', name: 'Onion', icon: '🧅', growTimeMs: 30_000, yieldAmount: 3, plantCost: 3 },
  pepper: { id: 'pepper', name: 'Pepper', icon: '🫑', growTimeMs: 60_000, yieldAmount: 4, plantCost: 5 },
  melon: { id: 'melon', name: 'Melon', icon: '🍈', growTimeMs: 90_000, yieldAmount: 6, plantCost: 8 },
  pumpkin: { id: 'pumpkin', name: 'Pumpkin', icon: '🎃', growTimeMs: 90_000, yieldAmount: 6, plantCost: 8 },
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
  category: 'food' | 'tools' | 'goods' | 'weapons';
  damage?: number;
  inputs: Record<string, number>;
  outputQty: number;
  outputItem?: string;
  craftTimeMs: number;
}

export const CRAFT_RECIPES: Record<string, CraftRecipeConfig> = {
  axeHomestead: { id: 'axeHomestead', name: 'Axe', icon: '🪓', category: 'tools', inputs: { wood: 5 }, outputQty: 1, outputItem: 'axe', craftTimeMs: 45_000 },
  pickaxeHomestead: { id: 'pickaxeHomestead', name: 'Pickaxe', icon: '⛏️', category: 'tools', inputs: { stone: 5 }, outputQty: 1, outputItem: 'pickaxe', craftTimeMs: 45_000 },
  bread: { id: 'bread', name: 'Bread', icon: '🍞', category: 'food', inputs: { wheat: 3 }, outputQty: 2, craftTimeMs: 20_000 },
  furniture: { id: 'furniture', name: 'Furniture', icon: '🪑', category: 'goods', inputs: { wood: 6 }, outputQty: 1, craftTimeMs: 45_000 },
  cheese: { id: 'cheese', name: 'Cheese', icon: '🧀', category: 'food', inputs: { milk: 2 }, outputQty: 1, craftTimeMs: 20_000 },
  yarn: { id: 'yarn', name: 'Yarn', icon: '🧵', category: 'goods', inputs: { wool: 2 }, outputQty: 1, craftTimeMs: 20_000 },
  omelette: { id: 'omelette', name: 'Omelette', icon: '🍳', category: 'food', inputs: { egg: 2 }, outputQty: 1, craftTimeMs: 20_000 },
  cornbread: { id: 'cornbread', name: 'Cornbread', icon: '🌽', category: 'food', inputs: { corn: 3 }, outputQty: 2, craftTimeMs: 30_000 },
  fries: { id: 'fries', name: 'Fries', icon: '🍟', category: 'food', inputs: { potato: 3 }, outputQty: 2, craftTimeMs: 30_000 },
  wagonWheel: { id: 'wagonWheel', name: 'Wagon Wheel', icon: '🛞', category: 'goods', inputs: { wood: 4, stone: 3 }, outputQty: 1, craftTimeMs: 60_000 },
  toolbox: { id: 'toolbox', name: 'Toolbox', icon: '🧰', category: 'tools', inputs: { axe: 1, pickaxe: 1 }, outputQty: 1, craftTimeMs: 90_000 },
  feast: { id: 'feast', name: 'Feast', icon: '🍲', category: 'food', inputs: { bread: 2, cheese: 1, omelette: 1 }, outputQty: 1, craftTimeMs: 75_000 },
  axeFall: { id: 'axeFall', name: 'Axe', icon: '🪓', category: 'tools', inputs: { hardwood: 5 }, outputQty: 1, outputItem: 'axe', craftTimeMs: 45_000 },
  pickaxeFall: { id: 'pickaxeFall', name: 'Pickaxe', icon: '⛏️', category: 'tools', inputs: { flint: 5 }, outputQty: 1, outputItem: 'pickaxe', craftTimeMs: 45_000 },
  pumpkinPie: { id: 'pumpkinPie', name: 'Pumpkin Pie', icon: '🥧', category: 'food', inputs: { pumpkin: 2 }, outputQty: 1, craftTimeMs: 20_000 },
  cranberrySauce: { id: 'cranberrySauce', name: 'Cranberry Sauce', icon: '🍯', category: 'food', inputs: { cranberry: 3 }, outputQty: 2, craftTimeMs: 20_000 },
  roastedSquash: { id: 'roastedSquash', name: 'Roasted Squash', icon: '🍠', category: 'food', inputs: { squash: 2 }, outputQty: 1, craftTimeMs: 20_000 },
  harvestFeast: { id: 'harvestFeast', name: 'Harvest Feast', icon: '🦃', category: 'food', inputs: { pumpkinPie: 1, cranberrySauce: 1, roastedSquash: 1 }, outputQty: 1, craftTimeMs: 75_000 },
  hardwoodFurniture: { id: 'hardwoodFurniture', name: 'Hardwood Furniture', icon: '🪵', category: 'goods', inputs: { hardwood: 6 }, outputQty: 1, craftTimeMs: 45_000 },
  flintBlade: { id: 'flintBlade', name: 'Flint Blade', icon: '🔪', category: 'goods', inputs: { flint: 4 }, outputQty: 1, craftTimeMs: 45_000 },
  axeSnow: { id: 'axeSnow', name: 'Axe', icon: '🪓', category: 'tools', inputs: { pine: 5 }, outputQty: 1, outputItem: 'axe', craftTimeMs: 45_000 },
  iceAxe: { id: 'iceAxe', name: 'Ice Axe', icon: '⛏️', category: 'tools', inputs: { pine: 3, ice: 3 }, outputQty: 1, craftTimeMs: 60_000 },
  pineFurniture: { id: 'pineFurniture', name: 'Pine Furniture', icon: '🪑', category: 'goods', inputs: { pine: 6 }, outputQty: 1, craftTimeMs: 45_000 },
  iceCarving: { id: 'iceCarving', name: 'Ice Carving', icon: '🗿', category: 'goods', inputs: { ice: 4 }, outputQty: 1, craftTimeMs: 45_000 },
  carrotSoup: { id: 'carrotSoup', name: 'Carrot Soup', icon: '🍲', category: 'food', inputs: { carrot: 3 }, outputQty: 2, craftTimeMs: 20_000 },
  cabbageRolls: { id: 'cabbageRolls', name: 'Cabbage Rolls', icon: '🥙', category: 'food', inputs: { cabbage: 2 }, outputQty: 1, craftTimeMs: 20_000 },
  turnipMash: { id: 'turnipMash', name: 'Turnip Mash', icon: '🍚', category: 'food', inputs: { turnip: 2 }, outputQty: 1, craftTimeMs: 20_000 },
  wintersFeast: { id: 'wintersFeast', name: "Winter's Feast", icon: '❄️', category: 'food', inputs: { carrotSoup: 1, cabbageRolls: 1, turnipMash: 1 }, outputQty: 1, craftTimeMs: 75_000 },
  woodenClub: { id: 'woodenClub', name: 'Wooden Club', icon: '🏏', category: 'weapons', inputs: { wood: 5 }, outputQty: 1, craftTimeMs: 30_000, damage: 10 },
  stoneHatchet: { id: 'stoneHatchet', name: 'Stone Hatchet', icon: '🪓', category: 'weapons', inputs: { wood: 3, stone: 4 }, outputQty: 1, craftTimeMs: 45_000, damage: 20 },
  huntingBow: { id: 'huntingBow', name: 'Hunting Bow', icon: '🏹', category: 'weapons', inputs: { hardwood: 4, flint: 3 }, outputQty: 1, craftTimeMs: 60_000, damage: 30 },
  iceSpear: { id: 'iceSpear', name: 'Ice Spear', icon: '🔱', category: 'weapons', inputs: { pine: 4, ice: 3 }, outputQty: 1, craftTimeMs: 60_000, damage: 35 },
  pickaxeDesert: { id: 'pickaxeDesert', name: 'Pickaxe', icon: '⛏️', category: 'tools', inputs: { sandstone: 5 }, outputQty: 1, outputItem: 'pickaxe', craftTimeMs: 45_000 },
  cactusFurniture: { id: 'cactusFurniture', name: 'Cactus Furniture', icon: '🪑', category: 'goods', inputs: { cactus: 6 }, outputQty: 1, craftTimeMs: 45_000 },
  sandstoneCarving: { id: 'sandstoneCarving', name: 'Sandstone Carving', icon: '🗿', category: 'goods', inputs: { sandstone: 4 }, outputQty: 1, craftTimeMs: 45_000 },
  pickledOnion: { id: 'pickledOnion', name: 'Pickled Onion', icon: '🥫', category: 'food', inputs: { onion: 3 }, outputQty: 2, craftTimeMs: 20_000 },
  stuffedPepper: { id: 'stuffedPepper', name: 'Stuffed Pepper', icon: '🌶️', category: 'food', inputs: { pepper: 2 }, outputQty: 1, craftTimeMs: 20_000 },
  melonJuice: { id: 'melonJuice', name: 'Melon Juice', icon: '🥤', category: 'food', inputs: { melon: 2 }, outputQty: 1, craftTimeMs: 20_000 },
  desertFeast: { id: 'desertFeast', name: 'Desert Feast', icon: '🏜️', category: 'food', inputs: { pickledOnion: 1, stuffedPepper: 1, melonJuice: 1 }, outputQty: 1, craftTimeMs: 75_000 },
  cactusBlade: { id: 'cactusBlade', name: 'Cactus Spike Blade', icon: '🗡️', category: 'weapons', inputs: { cactus: 4, sandstone: 3 }, outputQty: 1, craftTimeMs: 60_000, damage: 32 },
};

// ---------- General Store (only usable while in the Shop biome) ----------

export const SELL_PRICES: Record<string, number> = {
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
  toolbox: 10,
  axe: 3,
  pickaxe: 3,
  iceAxe: 5,
  feast: 12,
  squash: 1,
  cranberry: 1,
  pumpkin: 1,
  pumpkinPie: 2,
  cranberrySauce: 1,
  roastedSquash: 1,
  harvestFeast: 12,
  hardwoodFurniture: 2,
  flintBlade: 2,
  carrot: 1,
  cabbage: 1,
  turnip: 1,
  pineFurniture: 2,
  iceCarving: 2,
  carrotSoup: 2,
  cabbageRolls: 1,
  turnipMash: 1,
  wintersFeast: 12,
  woodenClub: 2,
  stoneHatchet: 4,
  huntingBow: 6,
  iceSpear: 7,
  onion: 1,
  pepper: 1,
  melon: 1,
  cactusFurniture: 2,
  sandstoneCarving: 2,
  pickledOnion: 1,
  stuffedPepper: 1,
  melonJuice: 2,
  desertFeast: 12,
  cactusBlade: 7,
};

export const DEMAND_STEP = 3;
export const DEMAND_RECOVERY_MS = 120_000;
