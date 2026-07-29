export interface PlayerRow {
  id: string;
  username: string;
  discord_id: string | null;
  money: number;
  created_at: number;
}

export interface TileRow {
  x: number;
  y: number;
  owner_id: string | null;
  crop_type: string | null;
  planted_at: number | null;
}

export interface ClientTile {
  x: number;
  y: number;
  ownerId: string | null;
  cropType: string | null;
  plantedAt: number | null;
  ready: boolean;
}
