import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  MatchDraft,
  MatchReport,
  Player,
  TournamentData,
  TournamentState,
} from "../types";
import { defaultTournamentState } from "./tournament";

type PlayerPatch = Pick<Player, "name" | "active">;

export type TournamentRepository = {
  mode: "supabase" | "local";
  loadData: () => Promise<TournamentData>;
  subscribe: (
    onChange: () => void,
    onConnectionStatus?: (message: string | null) => void,
  ) => () => void;
  addPlayer: (name: string) => Promise<void>;
  updatePlayer: (id: string, patch: PlayerPatch) => Promise<void>;
  deletePlayer: (id: string) => Promise<void>;
  startTournament: () => Promise<void>;
  resetTournament: () => Promise<void>;
  startFinal: (playerAId: string, playerBId: string) => Promise<void>;
  reportMatch: (draft: MatchDraft) => Promise<void>;
  updateMatchWinner: (matchId: string, winnerId: string) => Promise<void>;
  deleteMatch: (matchId: string) => Promise<void>;
};

const storageKey = "suvun-italia-open-v1";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublicKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublicKey);

const now = () => new Date().toISOString();

const cleanName = (name: string) => name.trim().replace(/\s+/g, " ");

const emptyData = (): TournamentData => ({
  players: [],
  matches: [],
  state: defaultTournamentState(),
});

const ensureValidMatch = (draft: MatchDraft) => {
  if (!draft.playerAId || !draft.playerBId || !draft.winnerId) {
    throw new Error("Valitse molemmat pelaajat ja voittaja.");
  }

  if (draft.playerAId === draft.playerBId) {
    throw new Error("Pelaaja ei voi pelata itseään vastaan.");
  }

  if (![draft.playerAId, draft.playerBId].includes(draft.winnerId)) {
    throw new Error("Voittajan pitää olla toinen pelaajista.");
  }
};

const throwIfError = (error: { message: string } | null) => {
  if (error) {
    throw new Error(error.message);
  }
};

const readLocalData = (): TournamentData => {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return emptyData();
  }

  try {
    return JSON.parse(raw) as TournamentData;
  } catch {
    return emptyData();
  }
};

const writeLocalData = (data: TournamentData) => {
  window.localStorage.setItem(storageKey, JSON.stringify(data));
};

const createLocalRepository = (): TournamentRepository => ({
  mode: "local",

  async loadData() {
    const data = readLocalData();
    writeLocalData(data);
    return data;
  },

  async addPlayer(name) {
    const normalizedName = cleanName(name);
    if (!normalizedName) {
      throw new Error("Nimi puuttuu.");
    }

    const data = readLocalData();
    data.players.push({
      id: crypto.randomUUID(),
      name: normalizedName,
      active: true,
      created_at: now(),
    });
    writeLocalData(data);
  },

  async updatePlayer(id, patch) {
    const data = readLocalData();
    data.players = data.players.map((player) =>
      player.id === id
        ? { ...player, name: cleanName(patch.name), active: patch.active }
        : player,
    );
    writeLocalData(data);
  },

  async deletePlayer(id) {
    const data = readLocalData();
    data.players = data.players.filter((player) => player.id !== id);
    data.matches = data.matches.filter(
      (match) =>
        match.player_a_id !== id &&
        match.player_b_id !== id &&
        match.winner_id !== id,
    );

    if (
      data.state.final_player_a_id === id ||
      data.state.final_player_b_id === id
    ) {
      data.state = {
        ...data.state,
        status: "group_stage",
        final_player_a_id: null,
        final_player_b_id: null,
        champion_id: null,
        updated_at: now(),
      };
    }

    writeLocalData(data);
  },

  async startTournament() {
    const data = readLocalData();
    data.state = {
      ...data.state,
      status: "group_stage",
      final_player_a_id: null,
      final_player_b_id: null,
      champion_id: null,
      updated_at: now(),
    };
    writeLocalData(data);
  },

  async resetTournament() {
    const data = readLocalData();
    data.matches = [];
    data.state = defaultTournamentState();
    writeLocalData(data);
  },

  async startFinal(playerAId, playerBId) {
    const data = readLocalData();
    data.matches = data.matches.filter((match) => match.stage !== "finaali");
    data.state = {
      ...data.state,
      status: "final",
      final_player_a_id: playerAId,
      final_player_b_id: playerBId,
      champion_id: null,
      updated_at: now(),
    };
    writeLocalData(data);
  },

  async reportMatch(draft) {
    ensureValidMatch(draft);
    const data = readLocalData();
    const createdAt = now();

    data.matches.push({
      id: crypto.randomUUID(),
      player_a_id: draft.playerAId,
      player_b_id: draft.playerBId,
      winner_id: draft.winnerId,
      stage: draft.stage,
      created_at: createdAt,
      updated_at: createdAt,
    });

    if (draft.stage === "finaali") {
      data.state = {
        ...data.state,
        champion_id: draft.winnerId,
        updated_at: now(),
      };
    }

    writeLocalData(data);
  },

  async updateMatchWinner(matchId, winnerId) {
    const data = readLocalData();
    const match = data.matches.find((item) => item.id === matchId);

    if (!match) {
      throw new Error("Ottelua ei löytynyt.");
    }

    if (![match.player_a_id, match.player_b_id].includes(winnerId)) {
      throw new Error("Voittajan pitää olla toinen pelaajista.");
    }

    data.matches = data.matches.map((item) =>
      item.id === matchId
        ? { ...item, winner_id: winnerId, updated_at: now() }
        : item,
    );

    if (match.stage === "finaali") {
      data.state = {
        ...data.state,
        champion_id: winnerId,
        updated_at: now(),
      };
    }

    writeLocalData(data);
  },

  async deleteMatch(matchId) {
    const data = readLocalData();
    const match = data.matches.find((item) => item.id === matchId);
    data.matches = data.matches.filter((item) => item.id !== matchId);

    if (match?.stage === "finaali") {
      data.state = {
        ...data.state,
        champion_id: null,
        updated_at: now(),
      };
    }

    writeLocalData(data);
  },

  subscribe(onChange) {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        onChange();
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },
});

const createSupabaseRepository = (
  supabase: SupabaseClient,
): TournamentRepository => ({
  mode: "supabase",

  async loadData() {
    const [playersResult, matchesResult, stateResult] = await Promise.all([
      supabase.from("players").select("*").order("created_at"),
      supabase.from("matches").select("*").order("created_at"),
      supabase.from("tournament_state").select("*").eq("id", 1).maybeSingle(),
    ]);

    throwIfError(playersResult.error);
    throwIfError(matchesResult.error);
    throwIfError(stateResult.error);

    let state = stateResult.data as TournamentState | null;

    if (!state) {
      const insertResult = await supabase
        .from("tournament_state")
        .insert(defaultTournamentState())
        .select("*")
        .single();
      throwIfError(insertResult.error);
      state = insertResult.data as TournamentState;
    }

    return {
      players: (playersResult.data ?? []) as Player[],
      matches: (matchesResult.data ?? []) as MatchReport[],
      state,
    };
  },

  subscribe(onChange, onConnectionStatus) {
    const channel = supabase
      .channel("tournament-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournament_state" },
        onChange,
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          onConnectionStatus?.("Supabase-reaaliaikayhteys epäonnistui.");
        }

        if (status === "TIMED_OUT") {
          onConnectionStatus?.("Supabase-reaaliaikayhteys aikakatkaistiin.");
        }

        if (status === "SUBSCRIBED") {
          onConnectionStatus?.(null);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  async addPlayer(name) {
    const normalizedName = cleanName(name);
    if (!normalizedName) {
      throw new Error("Nimi puuttuu.");
    }

    const { error } = await supabase.from("players").insert({
      name: normalizedName,
      active: true,
    });
    throwIfError(error);
  },

  async updatePlayer(id, patch) {
    const { error } = await supabase
      .from("players")
      .update({ name: cleanName(patch.name), active: patch.active })
      .eq("id", id);
    throwIfError(error);
  },

  async deletePlayer(id) {
    const deleteMatches = await supabase
      .from("matches")
      .delete()
      .or(`player_a_id.eq.${id},player_b_id.eq.${id},winner_id.eq.${id}`);
    throwIfError(deleteMatches.error);

    const deletePlayer = await supabase.from("players").delete().eq("id", id);
    throwIfError(deletePlayer.error);
  },

  async startTournament() {
    const { error } = await supabase.from("tournament_state").upsert({
      id: 1,
      status: "group_stage",
      final_player_a_id: null,
      final_player_b_id: null,
      champion_id: null,
      updated_at: now(),
    });
    throwIfError(error);
  },

  async resetTournament() {
    const deleteMatches = await supabase
      .from("matches")
      .delete()
      .not("id", "is", null);
    throwIfError(deleteMatches.error);

    const { error } = await supabase.from("tournament_state").upsert({
      ...defaultTournamentState(),
      id: 1,
    });
    throwIfError(error);
  },

  async startFinal(playerAId, playerBId) {
    const deleteFinal = await supabase
      .from("matches")
      .delete()
      .eq("stage", "finaali");
    throwIfError(deleteFinal.error);

    const { error } = await supabase.from("tournament_state").upsert({
      id: 1,
      status: "final",
      final_player_a_id: playerAId,
      final_player_b_id: playerBId,
      champion_id: null,
      updated_at: now(),
    });
    throwIfError(error);
  },

  async reportMatch(draft) {
    ensureValidMatch(draft);

    const insertMatch = await supabase.from("matches").insert({
      player_a_id: draft.playerAId,
      player_b_id: draft.playerBId,
      winner_id: draft.winnerId,
      stage: draft.stage,
    });
    throwIfError(insertMatch.error);

    if (draft.stage === "finaali") {
      const updateState = await supabase
        .from("tournament_state")
        .update({ champion_id: draft.winnerId, updated_at: now() })
        .eq("id", 1);
      throwIfError(updateState.error);
    }
  },

  async updateMatchWinner(matchId, winnerId) {
    const currentMatch = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();
    throwIfError(currentMatch.error);

    const match = currentMatch.data as MatchReport;

    if (![match.player_a_id, match.player_b_id].includes(winnerId)) {
      throw new Error("Voittajan pitää olla toinen pelaajista.");
    }

    const updateMatch = await supabase
      .from("matches")
      .update({ winner_id: winnerId, updated_at: now() })
      .eq("id", matchId);
    throwIfError(updateMatch.error);

    if (match.stage === "finaali") {
      const updateState = await supabase
        .from("tournament_state")
        .update({ champion_id: winnerId, updated_at: now() })
        .eq("id", 1);
      throwIfError(updateState.error);
    }
  },

  async deleteMatch(matchId) {
    const currentMatch = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();
    throwIfError(currentMatch.error);

    const match = currentMatch.data as MatchReport;
    const deleteMatch = await supabase.from("matches").delete().eq("id", matchId);
    throwIfError(deleteMatch.error);

    if (match.stage === "finaali") {
      const updateState = await supabase
        .from("tournament_state")
        .update({ champion_id: null, updated_at: now() })
        .eq("id", 1);
      throwIfError(updateState.error);
    }
  },
});

export const repository: TournamentRepository = hasSupabaseConfig
  ? createSupabaseRepository(createClient(supabaseUrl!, supabasePublicKey!))
  : createLocalRepository();
