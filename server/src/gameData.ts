export interface CropConfig {
  id: string;
  name: string;
  growTimeMs: number;
  yieldAmount: number;
  sellPrice: number;
  seedCost: number;
}

// Short grow times for now so you can actually test the loop.
// Tune these up once the loop feels right.
export const CROPS: Record<string, CropConfig> = {
  wheat: { id: 'wheat', name: 'Wheat', growTimeMs: 30_000, yieldAmount: 3, sellPrice: 5, seedCost: 2 },
  corn: { id: 'corn', name: 'Corn', growTimeMs: 60_000, yieldAmount: 4, sellPrice: 9, seedCost: 4 },
  potato: { id: 'potato', name: 'Potato', growTimeMs: 90_000, yieldAmount: 6, sellPrice: 6, seedCost: 3 },
};

export const MAP_SIZE = 15;
export const TILE_PRICE = 20;
export const STARTING_MONEY = 100;
