import type {
  MatchReport,
  Player,
  Standing,
  SuggestedMatch,
  TournamentData,
  TournamentState,
} from "../types";

export const defaultTournamentState = (): TournamentState => {
  const now = new Date().toISOString();

  return {
    id: 1,
    status: "not_started",
    final_player_a_id: null,
    final_player_b_id: null,
    champion_id: null,
    created_at: now,
    updated_at: now,
  };
};

export const groupMatches = (matches: MatchReport[]) =>
  matches.filter((match) => match.stage === "alkusarja");

export const finalMatches = (matches: MatchReport[]) =>
  matches.filter((match) => match.stage === "finaali");

export const activePlayers = (players: Player[]) =>
  [...players]
    .filter((player) => player.active)
    .sort((a, b) => a.name.localeCompare(b.name, "fi"));

export const playerName = (players: Player[], playerId: string | null) =>
  players.find((player) => player.id === playerId)?.name ?? "Tuntematon";

const isBetweenPlayers = (match: MatchReport, aId: string, bId: string) =>
  (match.player_a_id === aId && match.player_b_id === bId) ||
  (match.player_a_id === bId && match.player_b_id === aId);

export const matchesBetween = (
  matches: MatchReport[],
  aId: string,
  bId: string,
) => matches.filter((match) => isBetweenPlayers(match, aId, bId));

const headToHeadWinner = (
  matches: MatchReport[],
  aId: string,
  bId: string,
) => {
  const directMatches = matchesBetween(groupMatches(matches), aId, bId);
  const winsA = directMatches.filter((match) => match.winner_id === aId).length;
  const winsB = directMatches.filter((match) => match.winner_id === bId).length;

  if (winsA === winsB) {
    return null;
  }

  return winsA > winsB ? aId : bId;
};

export const buildStandings = (
  players: Player[],
  matches: MatchReport[],
): Standing[] => {
  const rows = activePlayers(players).map((player) => {
    const playedMatches = groupMatches(matches).filter(
      (match) =>
        match.player_a_id === player.id || match.player_b_id === player.id,
    );
    const wins = playedMatches.filter(
      (match) => match.winner_id === player.id,
    ).length;
    const played = playedMatches.length;
    const losses = played - wins;

    return {
      player,
      wins,
      losses,
      played,
      winRate: played === 0 ? 0 : wins / played,
    };
  });

  return rows.sort((a, b) => compareStandings(a, b, matches));
};

export const compareStandings = (
  a: Standing,
  b: Standing,
  matches: MatchReport[],
) => {
  if (a.wins !== b.wins) {
    return b.wins - a.wins;
  }

  if (a.losses !== b.losses) {
    return a.losses - b.losses;
  }

  if (a.played !== b.played) {
    return b.played - a.played;
  }

  const directWinner = headToHeadWinner(matches, a.player.id, b.player.id);
  if (directWinner === a.player.id) {
    return -1;
  }
  if (directWinner === b.player.id) {
    return 1;
  }

  const nameSort = a.player.name.localeCompare(b.player.name, "fi");
  return nameSort !== 0 ? nameSort : a.player.id.localeCompare(b.player.id);
};

const pairingReason = (a: Standing, b: Standing, repeatCount: number) => {
  if (repeatCount > 0) {
    return "Uusinta, jos vapaita pareja ei löydy";
  }

  if (a.played === 0 || b.played === 0) {
    return "Hyvä avauspeli";
  }

  if (a.wins === b.wins) {
    return "Sama voittomäärä";
  }

  return "Lähellä sarjataulukossa";
};

const candidateScore = (
  a: Standing,
  b: Standing,
  standings: Standing[],
  matches: MatchReport[],
) => {
  const repeatCount = matchesBetween(groupMatches(matches), a.player.id, b.player.id)
    .length;
  const rankGap = Math.abs(standings.indexOf(a) - standings.indexOf(b));
  const winGap = Math.abs(a.wins - b.wins);
  const playGap = Math.abs(a.played - b.played);

  return (
    repeatCount * 1000 +
    winGap * 90 +
    rankGap * 8 +
    (a.played + b.played) * 10 +
    playGap * 5
  );
};

export const buildSuggestedMatches = (
  data: TournamentData,
  limit = 10,
): SuggestedMatch[] => {
  if (data.state.status !== "group_stage") {
    return [];
  }

  const standings = buildStandings(data.players, data.matches);
  const suggestions: SuggestedMatch[] = [];

  for (let i = 0; i < standings.length; i += 1) {
    for (let j = i + 1; j < standings.length; j += 1) {
      const a = standings[i];
      const b = standings[j];
      const repeatCount = matchesBetween(
        groupMatches(data.matches),
        a.player.id,
        b.player.id,
      ).length;
      const score = candidateScore(a, b, standings, data.matches);

      suggestions.push({
        playerA: a.player,
        playerB: b.player,
        reason: pairingReason(a, b, repeatCount),
        repeatCount,
        score,
      });
    }
  }

  const uniqueMatches = suggestions.filter((match) => match.repeatCount === 0);
  const fallbackMatches = suggestions.filter((match) => match.repeatCount > 0);
  const sorted = [...uniqueMatches, ...fallbackMatches].sort(
    (a, b) => a.score - b.score,
  );

  return sorted.slice(0, limit);
};

export const nextOpponentsForPlayer = (
  playerId: string,
  data: TournamentData,
  limit = 3,
) => {
  const playerSuggestions = buildSuggestedMatches(data, 500).filter(
    (suggestion) =>
      suggestion.playerA.id === playerId || suggestion.playerB.id === playerId,
  );

  return playerSuggestions.slice(0, limit).map((suggestion) => ({
    opponent:
      suggestion.playerA.id === playerId
        ? suggestion.playerB
        : suggestion.playerA,
    suggestion,
  }));
};

export const finalPlayers = (data: TournamentData) => {
  const playerA = data.players.find(
    (player) => player.id === data.state.final_player_a_id,
  );
  const playerB = data.players.find(
    (player) => player.id === data.state.final_player_b_id,
  );

  if (!playerA || !playerB) {
    return null;
  }

  return { playerA, playerB };
};
