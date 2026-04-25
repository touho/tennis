import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ClipboardList,
  Crown,
  Flame,
  Flag,
  Home,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { repository } from "./lib/store";
import {
  activePlayers,
  buildStandings,
  buildSuggestedMatches,
  finalMatches,
  finalPlayers,
  nextOpponentsForPlayer,
  playerName,
} from "./lib/tournament";
import tennisImage from "./assets/hero-italia-open.png";
import ohjeetDesktop from "./assets/ohjeet_desktop.png";
import ohjeetMobile from "./assets/ohjeet_mobile.png";
import type {
  MatchDraft,
  MatchReport,
  Player,
  Standing,
  TournamentData,
} from "./types";

type MatchPrefill = {
  playerAId: string;
  playerBId: string;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("fi-FI", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const statusLabel = {
  not_started: "Odottaa starttia",
  group_stage: "Alkusarja",
  final: "Finaali",
};

function App() {
  const [data, setData] = useState<TournamentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{
    id: number;
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const isAdmin = window.location.pathname.startsWith("/admin");
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshPendingRef = useRef(false);
  const celebrationTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      refreshPendingRef.current = true;
      await refreshInFlightRef.current;
      return;
    }

    const nextRefresh = (async () => {
      const nextData = await repository.loadData();
      setData(nextData);
    })();

    refreshInFlightRef.current = nextRefresh;

    try {
      await nextRefresh;
    } finally {
      refreshInFlightRef.current = null;

      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        void refresh();
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadInitialData = async () => {
      try {
        await refresh();
        if (active) {
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Jokin meni pieleen.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    const unsubscribe = repository.subscribe(
      () => {
        void refresh().catch((err: Error) => {
          if (active) {
            setError(err.message);
          }
        });
      },
      (message) => {
        if (active) {
          setError(message);
        }
      },
    );

    void loadInitialData();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current) {
        window.clearTimeout(celebrationTimerRef.current);
      }
    };
  }, []);

  const runAction = useCallback(
    async (action: () => Promise<void>, success: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);

      try {
        await action();
        await refresh();
        setNotice(success);
        if (success === "Ottelu raportoitu." || success === "Mestari tallennettu.") {
          if (celebrationTimerRef.current) {
            window.clearTimeout(celebrationTimerRef.current);
          }
          setCelebration({
            id: Date.now(),
            text:
              success === "Mestari tallennettu."
                ? "Mestari tallennettu"
                : "Tulos tallennettu",
          });
          celebrationTimerRef.current = window.setTimeout(() => {
            setCelebration(null);
            celebrationTimerRef.current = null;
          }, 2600);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Jokin meni pieleen.");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  if (loading) {
    return <Shell isAdmin={isAdmin}>Ladataan turnausta...</Shell>;
  }

  if (!data) {
    return (
      <Shell isAdmin={isAdmin}>
        <StatusMessage tone="danger" text="Turnausta ei saatu ladattua." />
      </Shell>
    );
  }

  return (
    <Shell isAdmin={isAdmin}>
      {celebration ? (
        <VictoryToast key={celebration.id} text={celebration.text} />
      ) : null}
      {error ? <StatusMessage tone="danger" text={error} /> : null}
      {notice ? <StatusMessage tone="success" text={notice} /> : null}
      {isAdmin ? (
        <AdminPage data={data} busy={busy} runAction={runAction} />
      ) : (
        <PublicPage data={data} busy={busy} runAction={runAction} />
      )}
    </Shell>
  );
}

function Shell({
  children,
  isAdmin,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <Trophy size={24} />
          </span>
          <span>
            <strong>Italia-Open</strong>
            <small>Tennis, aurinko ja Casa Visette</small>
          </span>
        </a>
        {isAdmin ? (
          <a className="nav-link" href="/">
            <Home size={18} />
            Tulostaulu
          </a>
        ) : null}
      </header>
      <main>{children}</main>
      <ScoringFooter />
    </div>
  );
}

function ScoringFooter() {
  return (
    <footer className="scoring-footer">
      <div className="scoring-content">
        <img 
          src={ohjeetDesktop} 
          alt="Tenniksen pisteet ohje" 
          className="ohjeet-desktop" 
        />
        <img 
          src={ohjeetMobile} 
          alt="Tenniksen pisteet ohje" 
          className="ohjeet-mobile" 
        />
      </div>
    </footer>
  );
}

function PublicPage({
  data,
  busy,
  runAction,
}: {
  data: TournamentData;
  busy: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const standings = useMemo(
    () => buildStandings(data.players, data.matches),
    [data],
  );
  const suggestions = useMemo(() => buildSuggestedMatches(data, 6), [data]);
  const [prefill, setPrefill] = useState<MatchPrefill | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null);
  const finalPair = finalPlayers(data);
  const championName = playerName(data.players, data.state.champion_id);

  const openReportModal = (nextPrefill: MatchPrefill | null = null) => {
    setPrefill(nextPrefill);
    setIsReportModalOpen(true);
  };

  const closeReportModal = () => {
    setIsReportModalOpen(false);
    setPrefill(null);
  };

  const viewingPlayer = data.players.find((p) => p.id === viewingPlayerId);
  const playerMatches = viewingPlayerId
    ? data.matches.filter(
        (m) => m.player_a_id === viewingPlayerId || m.player_b_id === viewingPlayerId
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : [];

  return (
    <>
      <div className="page-grid">
        <section className="hero-panel">
          <div className="hero-image">
            <img src={tennisImage} alt="" aria-hidden="true" />
            <span className="eyebrow hero-status-badge">
              <Flag size={16} /> {statusLabel[data.state.status]}
            </span>
            <div className="hero-copy">
              <div className="hero-kicker" aria-label="Turnauksen tunnelma">
                <span>Casa Visette</span>
              </div>
              <h1>Italia-Open</h1>
              <p>
                Tennisloma Casa Visettessä: nopeat matsit, kova meteli ja
                voittajalle kruunu.
              </p>
            </div>
          </div>
        </section>

        <section className="main-column">
          {repository.mode === "local" ? (
            <StatusMessage
              tone="neutral"
              text="Paikallinen testitila. Supabase käynnistyy .env-arvoilla."
            />
          ) : null}

          {data.state.status === "not_started" ? (
            <EmptyState
              icon={<Play size={22} />}
              title="Turnaus odottaa starttia"
              text="Pelaajalista ja startti löytyvät administa."
            />
          ) : null}

          {data.state.status === "group_stage" ? (
            <>
              <div className="report-bar">
                <div className="section-title-banner">
                  <SectionTitle
                    icon={<Flame size={20} />}
                    title="Suositellut seuraavat pelit"
                  />
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => openReportModal()}
                >
                  <ClipboardList size={18} /> Raportoi tulos
                </button>
              </div>

              <div className="suggestions-section">
                <SuggestionGrid
                  suggestions={suggestions}
                  onReport={(playerAId, playerBId) =>
                    openReportModal({ playerAId, playerBId })
                  }
                />
              </div>
              <PlayerNextPanel data={data} onReport={openReportModal} />
            </>
          ) : null}

          {data.state.status === "final" ? (
            <FinalPanel
              data={data}
              finalPair={finalPair}
              championName={championName}
              busy={busy}
              runAction={runAction}
            />
          ) : null}
        </section>

        <aside className="side-column">
          <StandingsCard 
            standings={standings} 
            onPlayerClick={(id) => setViewingPlayerId(id)} 
          />
          <RecentMatches data={data} />
        </aside>
      </div>

      <ReportModal
        open={isReportModalOpen}
        title="Raportoi peli"
        onClose={closeReportModal}
      >
        <MatchReportForm
          data={data}
          busy={busy}
          stage="alkusarja"
          prefill={prefill}
          variant="plain"
          showHeader={false}
          onSuccess={closeReportModal}
          onSubmit={(draft) =>
            runAction(
              () => repository.reportMatch(draft),
              "Ottelu raportoitu.",
            )
          }
        />
      </ReportModal>

      <ReportModal
        open={Boolean(viewingPlayerId)}
        title={viewingPlayer ? `${viewingPlayer.name} – Ottelut` : "Otteluhistoria"}
        onClose={() => setViewingPlayerId(null)}
      >
        <div className="player-history-list">
          {playerMatches.length === 0 ? (
            <p className="empty-history">Ei vielä pelattuja otteluita.</p>
          ) : (
            playerMatches.map((match) => {
              const opponentId = match.player_a_id === viewingPlayerId ? match.player_b_id : match.player_a_id;
              const opponentName = playerName(data.players, opponentId);
              const isWinner = match.winner_id === viewingPlayerId;
              
              return (
                <div key={match.id} className={`history-row ${isWinner ? "won" : "lost"}`}>
                  <div className="history-main">
                    <span className="history-opponent">vastaan <strong>{opponentName}</strong></span>
                    <small className="history-meta">
                      {match.stage === "finaali" ? "Finaali" : "Alkusarja"} · {formatDate(match.created_at)}
                    </small>
                  </div>
                  <div className="history-result">
                    {isWinner ? (
                      <span className="result-badge win">Voitto</span>
                    ) : (
                      <span className="result-badge loss">Häviö</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ReportModal>
    </>
  );
}

function AdminPage({
  data,
  busy,
  runAction,
}: {
  data: TournamentData;
  busy: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const standings = useMemo(
    () => buildStandings(data.players, data.matches),
    [data],
  );
  const topTwo = standings.slice(0, 2);
  const activeCount = activePlayers(data.players).length;

  return (
    <div className="admin-grid">
      <section className="panel">
        <SectionTitle icon={<Settings size={20} />} title="Turnausohjaus" />
        <div className="control-row">
          <button
            className="primary-button"
            type="button"
            disabled={busy || activeCount < 2}
            onClick={() =>
              runAction(
                () => repository.startTournament(),
                "Turnaus käynnistetty.",
              )
            }
          >
            <Play size={18} /> Aloita turnaus
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Nollataanko ottelut ja turnauksen tila?")) {
                void runAction(
                  () => repository.resetTournament(),
                  "Turnaus nollattu.",
                );
              }
            }}
          >
            <RotateCcw size={18} /> Nollaa turnaus
          </button>
        </div>
        <div className="stat-strip">
          <Stat label="Pelaajia" value={activeCount.toString()} />
          <Stat label="Otteluita" value={data.matches.length.toString()} />
          <Stat label="Tila" value={statusLabel[data.state.status]} />
        </div>
        <button
          className="final-button"
          type="button"
          disabled={busy || topTwo.length < 2}
          onClick={() =>
            runAction(
              () =>
                repository.startFinal(
                  topTwo[0].player.id,
                  topTwo[1].player.id,
                ),
              "Finaali käynnistetty.",
            )
          }
        >
          <Crown size={18} /> Käynnistä finaali:{" "}
          {topTwo.length === 2
            ? `${topTwo[0].player.name} vastaan ${topTwo[1].player.name}`
            : "tarvitaan kaksi pelaajaa"}
        </button>
      </section>

      <section className="panel">
        <SectionTitle icon={<Users size={20} />} title="Pelaajat" />
        <AddPlayerForm busy={busy} runAction={runAction} />
        <div className="admin-list">
          {data.players.map((player) => (
            <PlayerEditor
              key={player.id}
              player={player}
              busy={busy}
              runAction={runAction}
            />
          ))}
        </div>
      </section>

      <section className="panel wide-panel">
        <SectionTitle
          icon={<ClipboardList size={20} />}
          title="Otteluraportit"
        />
        <div className="admin-list">
          {data.matches.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={22} />}
              title="Ei raportteja"
              text="Pelit ilmestyvät tähän raportoinnin jälkeen."
            />
          ) : (
            [...data.matches]
              .sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime(),
              )
              .map((match) => (
                <MatchEditor
                  key={match.id}
                  match={match}
                  players={data.players}
                  busy={busy}
                  runAction={runAction}
                />
              ))
          )}
        </div>
      </section>
    </div>
  );
}

function AddPlayerForm({
  busy,
  runAction,
}: {
  busy: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [name, setName] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const playerName = name;
    void runAction(
      async () => {
        await repository.addPlayer(playerName);
        setName("");
      },
      "Pelaaja lisätty.",
    );
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      <input
        name="player-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Pelaajan nimi"
      />
      <button type="submit" disabled={busy || !name.trim()}>
        <Plus size={18} /> Lisää
      </button>
    </form>
  );
}

function PlayerEditor({
  player,
  busy,
  runAction,
}: {
  player: Player;
  busy: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [name, setName] = useState(player.name);
  const [active, setActive] = useState(player.active);

  useEffect(() => {
    setName(player.name);
    setActive(player.active);
  }, [player]);

  return (
    <div className="admin-row">
      <input
        name={`player-name-${player.id}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label={`${player.name} nimi`}
      />
      <label className="toggle-label">
        <input
          name={`player-active-${player.id}`}
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        Mukana
      </label>
      <button
        className="icon-button"
        type="button"
        disabled={busy || !name.trim()}
        title="Tallenna"
        onClick={() =>
          runAction(
            () => repository.updatePlayer(player.id, { name, active }),
            "Pelaaja tallennettu.",
          )
        }
      >
        <Save size={18} />
      </button>
      <button
        className="icon-button danger-icon"
        type="button"
        disabled={busy}
        title="Poista"
        onClick={() => {
          if (window.confirm(`Poistetaanko ${player.name}?`)) {
            void runAction(
              () => repository.deletePlayer(player.id),
              "Pelaaja poistettu.",
            );
          }
        }}
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}

function MatchEditor({
  match,
  players,
  busy,
  runAction,
}: {
  match: MatchReport;
  players: Player[];
  busy: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [winnerId, setWinnerId] = useState(match.winner_id);

  useEffect(() => {
    setWinnerId(match.winner_id);
  }, [match]);

  return (
    <div className="match-editor">
      <div>
        <strong>
          {playerName(players, match.player_a_id)} vastaan{" "}
          {playerName(players, match.player_b_id)}
        </strong>
        <small>
          {match.stage === "finaali" ? "Finaali" : "Alkusarja"} ·{" "}
          {formatDate(match.created_at)}
        </small>
      </div>
      <select
        name={`winner-${match.id}`}
        value={winnerId}
        onChange={(event) => setWinnerId(event.target.value)}
        aria-label="Voittaja"
      >
        <option value={match.player_a_id}>
          {playerName(players, match.player_a_id)}
        </option>
        <option value={match.player_b_id}>
          {playerName(players, match.player_b_id)}
        </option>
      </select>
      <button
        className="icon-button"
        type="button"
        title="Tallenna"
        disabled={busy}
        onClick={() =>
          runAction(
            () => repository.updateMatchWinner(match.id, winnerId),
            "Raportti tallennettu.",
          )
        }
      >
        <Pencil size={18} />
      </button>
      <button
        className="icon-button danger-icon"
        type="button"
        title="Poista"
        disabled={busy}
        onClick={() => {
          if (window.confirm("Poistetaanko otteluraportti?")) {
            void runAction(
              () => repository.deleteMatch(match.id),
              "Raportti poistettu.",
            );
          }
        }}
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}

function SuggestionGrid({
  suggestions,
  onReport,
}: {
  suggestions: ReturnType<typeof buildSuggestedMatches>;
  onReport: (playerAId: string, playerBId: string) => void;
}) {
  if (suggestions.length === 0) {
    return (
      <EmptyState
        icon={<Flame size={22} />}
        title="Ei pelipareja"
        text="Lisää pelaajia tai käynnistä turnaus adminissa."
      />
    );
  }

  return (
    <div className="suggestion-grid">
      {suggestions.map((suggestion) => (
        <article
          className="suggestion-card"
          key={`${suggestion.playerA.id}-${suggestion.playerB.id}`}
        >
          <div>
            <strong>{suggestion.playerA.name}</strong>
            <span>vastaan</span>
            <strong>{suggestion.playerB.name}</strong>
          </div>
          <small>{suggestion.reason}</small>
          <button
            type="button"
            onClick={() =>
              onReport(suggestion.playerA.id, suggestion.playerB.id)
            }
          >
            <Check size={17} /> Raportoi tulos
          </button>
        </article>
      ))}
    </div>
  );
}

function PlayerNextPanel({
  data,
  onReport,
}: {
  data: TournamentData;
  onReport: (prefill: MatchPrefill) => void;
}) {
  const players = activePlayers(data.players);
  const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.id ?? "");

  useEffect(() => {
    if (!players.some((player) => player.id === selectedPlayerId)) {
      setSelectedPlayerId(players[0]?.id ?? "");
    }
  }, [players, selectedPlayerId]);

  const nextOpponents = selectedPlayerId
    ? nextOpponentsForPlayer(selectedPlayerId, data)
    : [];

  return (
    <section className="panel compact-panel">
      <SectionTitle icon={<Users size={20} />} title="Haastaja-automaatti" />
      <p className="panel-hint">
        Valitse itsesi ja katso, ketä vastaan sinun kannattaa pelata seuraavaksi.
      </p>
      <label className="picker-label" htmlFor="selected-player">
        <span>Kuka astuu kentälle?</span>
        <select
          id="selected-player"
          name="selected-player"
          value={selectedPlayerId}
          onChange={(event) => setSelectedPlayerId(event.target.value)}
        >
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </label>
      <div className="opponent-list">
        {nextOpponents.length === 0 ? (
          <small>Ei ehdotuksia valitulle pelaajalle.</small>
        ) : (
          nextOpponents.map(({ opponent, suggestion }) => (
            <button
              type="button"
              key={opponent.id}
              onClick={() =>
                onReport({
                  playerAId: selectedPlayerId,
                  playerBId: opponent.id,
                })
              }
            >
              <span>{opponent.name}</span>
              <small>{suggestion.reason}</small>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function MatchReportForm({
  data,
  busy,
  stage,
  prefill,
  fixedPlayers,
  showHeader = true,
  variant = "panel",
  onSuccess,
  onSubmit,
}: {
  data: TournamentData;
  busy: boolean;
  stage: MatchDraft["stage"];
  prefill?: MatchPrefill | null;
  fixedPlayers?: MatchPrefill;
  showHeader?: boolean;
  variant?: "panel" | "plain";
  onSuccess?: () => void;
  onSubmit: (draft: MatchDraft) => Promise<void>;
}) {
  const players = activePlayers(data.players);
  const [playerAId, setPlayerAId] = useState(fixedPlayers?.playerAId ?? "");
  const [playerBId, setPlayerBId] = useState(fixedPlayers?.playerBId ?? "");
  const [winnerId, setWinnerId] = useState("");

  useEffect(() => {
    if (fixedPlayers) {
      setPlayerAId(fixedPlayers.playerAId);
      setPlayerBId(fixedPlayers.playerBId);
      setWinnerId("");
    }
  }, [fixedPlayers]);

  useEffect(() => {
    if (prefill) {
      setPlayerAId(prefill.playerAId);
      setPlayerBId(prefill.playerBId);
      setWinnerId("");
    }
  }, [prefill]);

  const canSubmit = Boolean(playerAId && playerBId && winnerId);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit({ playerAId, playerBId, winnerId, stage }).then(() => {
      if (!fixedPlayers) {
        setWinnerId("");
      }
      onSuccess?.();
    });
  };

  const chosenPlayers = [playerAId, playerBId]
    .map((playerId) => players.find((player) => player.id === playerId))
    .filter((player): player is Player => Boolean(player));
  const shellClassName = [
    variant === "plain" ? "report-form-shell" : "panel",
    stage === "finaali" ? "final-report-panel" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={shellClassName}>
      {showHeader ? (
        <SectionTitle
          icon={<ClipboardList size={20} />}
          title={stage === "finaali" ? "Raportoi finaali" : "Raportoi peli"}
        />
      ) : null}
      <form className="report-form" onSubmit={submit}>
        {!fixedPlayers ? (
          <div className="form-grid">
            <label>
              <span>Pelaaja 1</span>
              <select
                name="player-a"
                value={playerAId}
                onChange={(event) => {
                  setPlayerAId(event.target.value);
                  setWinnerId("");
                }}
              >
                <option value="">Valitse</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Pelaaja 2</span>
              <select
                name="player-b"
                value={playerBId}
                onChange={(event) => {
                  setPlayerBId(event.target.value);
                  setWinnerId("");
                }}
              >
                <option value="">Valitse</option>
                {players
                  .filter((player) => player.id !== playerAId)
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="final-pair">
            <strong>{playerName(data.players, playerAId)}</strong>
            <span>vastaan</span>
            <strong>{playerName(data.players, playerBId)}</strong>
          </div>
        )}

        <div className="winner-picker">
          <span>Kumpi voitti?</span>
          <div className="winner-buttons" aria-label="Voittaja">
            {chosenPlayers.map((player) => (
              <button
                key={player.id}
                type="button"
                className={winnerId === player.id ? "selected" : ""}
                onClick={() => setWinnerId(player.id)}
              >
                <Crown size={17} /> {player.name}
              </button>
            ))}
          </div>
        </div>

        <button
          className="primary-button"
          type="submit"
          disabled={busy || !canSubmit || playerAId === playerBId}
        >
          <Save size={18} /> Tallenna voitto
        </button>
      </form>
    </section>
  );
}

function ReportModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-button modal-close"
            type="button"
            aria-label="Sulje raportointi"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FinalPanel({
  data,
  finalPair,
  championName,
  busy,
  runAction,
}: {
  data: TournamentData;
  finalPair: ReturnType<typeof finalPlayers>;
  championName: string;
  busy: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  if (!finalPair) {
    return (
      <EmptyState
        icon={<Crown size={22} />}
        title="Finaalipari puuttuu"
        text="Käynnistä finaali adminissa."
      />
    );
  }

  if (data.state.champion_id) {
    return (
      <section className="champion-panel">
        <Crown size={42} />
        <span>Mestari</span>
        <h2>{championName}</h2>
      </section>
    );
  }

  return (
    <MatchReportForm
      data={data}
      busy={busy}
      stage="finaali"
      fixedPlayers={{
        playerAId: finalPair.playerA.id,
        playerBId: finalPair.playerB.id,
      }}
      onSubmit={(draft) =>
        runAction(
          () => repository.reportMatch(draft),
          "Mestari tallennettu.",
        )
      }
    />
  );
}

function StandingsCard({ 
  standings, 
  onPlayerClick 
}: { 
  standings: Standing[];
  onPlayerClick?: (playerId: string) => void;
}) {
  return (
    <section className="panel standings-panel">
      <SectionTitle icon={<Trophy size={20} />} title="Sarjataulukko" />
      <div className="standings-list">
        {standings.length === 0 ? (
          <small>Ei pelaajia.</small>
        ) : (
          standings.map((standing, index) => (
            <div className="standing-row" key={standing.player.id}>
              <span className="rank">{index + 1}</span>
              <button 
                type="button"
                className="standing-name-button"
                onClick={() => onPlayerClick?.(standing.player.id)}
              >
                <strong className="standing-name">{standing.player.name}</strong>
              </button>
              <span className="standing-wins">{standing.wins}V</span>
              <span className="standing-losses">{standing.losses}H</span>
              <small className="standing-played">{standing.played} peliä</small>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function RecentMatches({ data }: { data: TournamentData }) {
  const recentMatches = [...data.matches]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 8);
  const finals = finalMatches(data.matches);

  return (
    <section className="panel">
      <SectionTitle icon={<ClipboardList size={20} />} title="Viimeisimmät pelit" />
      <div className="recent-list">
        {recentMatches.length === 0 ? (
          <small>Ei otteluita.</small>
        ) : (
          recentMatches.map((match) => (
            <div className="recent-row" key={match.id}>
              <span>{match.stage === "finaali" ? "Finaali" : "Peli"}</span>
              <strong>
                {playerName(data.players, match.winner_id)} voitti
              </strong>
              <small>
                {playerName(data.players, match.player_a_id)} vastaan{" "}
                {playerName(data.players, match.player_b_id)}
              </small>
            </div>
          ))
        )}
      </div>
      {finals.length > 0 ? (
        <small className="footer-note">Finaaliraportteja: {finals.length}</small>
      ) : null}
    </section>
  );
}

function SectionTitle({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="section-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <section className="empty-state">
      {icon}
      <strong>{title}</strong>
      <span>{text}</span>
    </section>
  );
}

function StatusMessage({
  text,
  tone,
}: {
  text: string;
  tone: "danger" | "success" | "neutral";
}) {
  return <div className={`status-message ${tone}`}>{text}</div>;
}

function VictoryToast({ text }: { text: string }) {
  return (
    <div className="victory-toast" role="status" aria-live="polite">
      <div className="victory-burst" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="victory-toast-card">
        <span className="victory-icon" aria-hidden="true">
          <Crown size={22} />
        </span>
        <div>
          <strong>{text}</strong>
          <small>Voitto kirjattu Casa Visetten tauluun.</small>
        </div>
        <Check size={20} aria-hidden="true" />
      </div>
    </div>
  );
}

export default App;
