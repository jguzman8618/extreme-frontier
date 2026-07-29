export interface PlayerRow {
  id: string;
  username: string;
  discord_id: string | null;
  x: number;
  y: number;
  created_at: number;
}

export interface CropRow {
  x: number;
  y: number;
  owner_id: string;
  crop_type: string;
  planted_at: number;
}

export interface BuildingRow {
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
