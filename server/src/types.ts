export interface PlayerRow {
  id: string;
  username: string;
  discord_id: string | null;
  created_at: number;
}

export interface SaveRow {
  player_id: string;
  data: unknown;
  updated_at: number;
}
