export interface PlayerRow {
  id: string;
  username: string;
  discord_id: string | null;
  biome: string;
  x: number;
  y: number;
  created_at: number;
}

export interface CropRow {
  biome: string;
  x: number;
  y: number;
  owner_id: string;
  crop_type: string;
  planted_at: number;
}

export interface BuildingRow {
  biome: string;
  x: number;
  y: number;
  plot_id: string;
  owner_id: string;
  type: string;
}

export interface PlotOwnerRow {
  plot_id: string;
  owner_id: string;
  claimed_at: number;
}
