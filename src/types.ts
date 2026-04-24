export type TournamentStatus = "not_started" | "group_stage" | "final";

export type MatchStage = "alkusarja" | "finaali";

export type Player = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
};

export type MatchReport = {
  id: string;
  player_a_id: string;
  player_b_id: string;
  winner_id: string;
  stage: MatchStage;
  created_at: string;
  updated_at: string;
};

export type TournamentState = {
  id: number;
  status: TournamentStatus;
  final_player_a_id: string | null;
  final_player_b_id: string | null;
  champion_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TournamentData = {
  players: Player[];
  matches: MatchReport[];
  state: TournamentState;
};

export type Standing = {
  player: Player;
  wins: number;
  losses: number;
  played: number;
  winRate: number;
};

export type SuggestedMatch = {
  playerA: Player;
  playerB: Player;
  reason: string;
  repeatCount: number;
  score: number;
};

export type MatchDraft = {
  playerAId: string;
  playerBId: string;
  winnerId: string;
  stage: MatchStage;
};
