import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  GROUPS,
  GROUP_LETTERS,
  type GroupLetter,
  type GroupMatch,
  type KnockoutMatch,
  KNOCKOUT_REFS,
  generateGroupMatches,
  computeStandings,
  rankThirds,
  assignThirds,
  buildEmptyKnockout,
  populateKnockout,
  winnerOf,
  sampleScores,
} from "@/lib/worldcup";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Simulador Copa do Mundo 2026" },
      { name: "description", content: "Simule a Copa do Mundo 2026: edite resultados, veja classificação, melhores terceiros e o chaveamento do mata-mata." },
    ],
  }),
  component: Index,
});

const STORAGE_KEY = "wc2026-sim-v1";
const BRAZIL = "Brasil";

interface State {
  matches: GroupMatch[];
  knockout: Record<number, KnockoutMatch>;
}

function loadState(): State {
  if (typeof window === "undefined") {
    return { matches: generateGroupMatches(), knockout: buildEmptyKnockout() };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (parsed.matches && parsed.knockout) return parsed;
    }
  } catch {}
  return { matches: generateGroupMatches(), knockout: buildEmptyKnockout() };
}

function Index() {
  const [state, setState] = useState<State>(() => ({
    matches: generateGroupMatches(),
    knockout: buildEmptyKnockout(),
  }));
  const [hydrated, setHydrated] = useState(false);
  const [activeGroup, setActiveGroup] = useState<GroupLetter>("A");

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state, hydrated]);

  const standings = useMemo(() => computeStandings(state.matches), [state.matches]);
  const thirds = useMemo(() => rankThirds(standings), [standings]);
  const thirdAssign = useMemo(() => assignThirds(thirds), [thirds]);

  // Recompute knockout slots when group data changes
  useEffect(() => {
    setState(s => {
      const next = populateKnockout(standings, thirdAssign, s.knockout);
      // shallow compare to avoid loop
      const changed = Object.keys(next).some(k => {
        const a = next[+k], b = s.knockout[+k];
        return !b || a.home !== b.home || a.away !== b.away ||
          a.homeScore !== b.homeScore || a.awayScore !== b.awayScore || a.penWinner !== b.penWinner;
      });
      return changed ? { ...s, knockout: next } : s;
    });
  }, [standings, thirdAssign]);

  const updateGroupScore = (id: string, side: "home" | "away", val: string) => {
    const n = val === "" ? null : Math.max(0, Math.min(99, parseInt(val, 10) || 0));
    setState(s => ({
      ...s,
      matches: s.matches.map(m => m.id === id ? { ...m, [side === "home" ? "homeScore" : "awayScore"]: n } : m),
    }));
  };

  const updateKnockoutScore = (id: number, side: "home" | "away", val: string) => {
    const n = val === "" ? null : Math.max(0, Math.min(99, parseInt(val, 10) || 0));
    setState(s => {
      const m = { ...s.knockout[id], [side === "home" ? "homeScore" : "awayScore"]: n } as KnockoutMatch;
      if (m.homeScore !== m.awayScore) m.penWinner = null;
      return { ...s, knockout: { ...s.knockout, [id]: m } };
    });
  };

  const setPenWinner = (id: number, w: "home" | "away" | null) => {
    setState(s => ({ ...s, knockout: { ...s.knockout, [id]: { ...s.knockout[id], penWinner: w } } }));
  };

  const reset = () => {
    if (!confirm("Resetar toda a simulação?")) return;
    setState({ matches: generateGroupMatches(), knockout: buildEmptyKnockout() });
  };

  const fillSample = () => {
    setState(s => ({
      ...s,
      matches: s.matches.map((m, i) => ({
        ...m,
        homeScore: sampleScores(i * 7 + 3),
        awayScore: sampleScores(i * 11 + 5),
      })),
    }));
  };

  const champion = winnerOf(state.knockout[104]);

  return (
    <div className="min-h-screen">
      <Header onReset={reset} onSample={fillSample} />
      <main className="mx-auto max-w-7xl px-4 py-8 space-y-12">
        <SectionGroups
          state={state}
          activeGroup={activeGroup}
          setActiveGroup={setActiveGroup}
          standings={standings}
          updateGroupScore={updateGroupScore}
        />
        <SectionStandings standings={standings} />
        <SectionThirds thirds={thirds} />
        <SectionKnockout
          knockout={state.knockout}
          updateKnockoutScore={updateKnockoutScore}
          setPenWinner={setPenWinner}
        />
        <SectionChampion champion={champion} />
      </main>
      <footer className="mx-auto max-w-7xl px-4 py-8 text-center text-sm text-muted-foreground">
        Simulador não oficial. Dados salvos automaticamente no seu navegador.
      </footer>
    </div>
  );
}

/* ------------ Header ------------ */
function Header({ onReset, onSample }: { onReset: () => void; onSample: () => void }) {
  return (
    <header
      className="border-b border-border"
      style={{ backgroundImage: "var(--gradient-hero)" }}
    >
      <div className="mx-auto max-w-7xl px-4 py-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">FIFA não oficial</p>
          <h1 className="mt-2 text-4xl sm:text-6xl font-bold text-foreground">
            Simulador <span className="text-primary">Copa 2026</span>
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl">
            48 seleções, 12 grupos, mata-mata até a final. Edite os placares e veja o chaveamento se montar sozinho.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onSample}
            className="rounded-md bg-accent px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-accent-foreground hover:opacity-90 transition"
          >
            Preencher exemplo
          </button>
          <button
            onClick={onReset}
            className="rounded-md border border-border bg-card/60 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-foreground hover:bg-card transition"
          >
            Resetar
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------ Section title ------------ */
function SectionTitle({ n, title, subtitle }: { n: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <div className="text-xs uppercase tracking-[0.25em] text-accent">{n}</div>
      <h2 className="text-3xl font-bold mt-1">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

/* ------------ Groups & matches ------------ */
function SectionGroups({
  state, activeGroup, setActiveGroup, standings, updateGroupScore,
}: {
  state: State;
  activeGroup: GroupLetter;
  setActiveGroup: (g: GroupLetter) => void;
  standings: ReturnType<typeof computeStandings>;
  updateGroupScore: (id: string, side: "home" | "away", val: string) => void;
}) {
  const groupMatches = state.matches.filter(m => m.group === activeGroup);
  return (
    <section>
      <SectionTitle n="01 — Fase de grupos" title="Grupos & jogos" subtitle="Selecione um grupo e edite os placares dos 6 jogos." />
      <div className="flex flex-wrap gap-2 mb-6">
        {GROUP_LETTERS.map(g => (
          <button
            key={g}
            onClick={() => setActiveGroup(g)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold border transition ${
              activeGroup === g
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:border-primary/50"
            }`}
          >
            Grupo {g}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div
          className="rounded-xl border border-border p-5"
          style={{ backgroundImage: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
        >
          <h3 className="text-xl font-bold mb-4">Jogos — Grupo {activeGroup}</h3>
          <ul className="space-y-3">
            {groupMatches.map(m => (
              <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-lg bg-background/40 p-3 border border-border">
                <TeamLabel name={m.home} align="right" />
                <div className="flex items-center gap-1">
                  <ScoreInput value={m.homeScore} onChange={v => updateGroupScore(m.id, "home", v)} />
                  <span className="text-muted-foreground">×</span>
                  <ScoreInput value={m.awayScore} onChange={v => updateGroupScore(m.id, "away", v)} />
                </div>
                <TeamLabel name={m.away} align="left" />
              </li>
            ))}
          </ul>
        </div>

        <div
          className="rounded-xl border border-border p-5"
          style={{ backgroundImage: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
        >
          <h3 className="text-xl font-bold mb-4">Classificação ao vivo</h3>
          <MiniStandingsTable rows={standings[activeGroup]} />
        </div>
      </div>
    </section>
  );
}

function ScoreInput({ value, onChange }: { value: number | null; onChange: (v: string) => void }) {
  return (
    <input
      type="number"
      min={0}
      max={99}
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      className="w-12 rounded-md border border-input bg-background px-2 py-1.5 text-center font-bold focus:outline-none focus:ring-2 focus:ring-ring"
      placeholder="-"
    />
  );
}

function TeamLabel({ name, align }: { name: string; align: "left" | "right" }) {
  const isBr = name === BRAZIL;
  return (
    <div className={`flex items-center gap-2 min-w-0 ${align === "right" ? "justify-end" : "justify-start"}`}>
      {align === "left" && isBr && <BrazilDot />}
      <span className={`truncate font-medium ${isBr ? "text-brazil font-bold" : ""}`}>{name}</span>
      {align === "right" && isBr && <BrazilDot />}
    </div>
  );
}
function BrazilDot() {
  return <span className="inline-block h-2 w-2 rounded-full bg-brazil shrink-0" />;
}

/* ------------ Mini standings (inside group section) ------------ */
function MiniStandingsTable({ rows }: { rows: ReturnType<typeof computeStandings>[GroupLetter] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-xs uppercase">
          <tr>
            <th className="text-left py-2">#</th>
            <th className="text-left">Seleção</th>
            <th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.team} className={`border-t border-border ${r.team === BRAZIL ? "bg-brazil/10" : ""}`}>
              <td className="py-2">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${
                  i < 2 ? "bg-success text-success-foreground" : i === 2 ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground"
                }`}>{i + 1}</span>
              </td>
              <td className={`font-medium ${r.team === BRAZIL ? "text-brazil" : ""}`}>{r.team}</td>
              <td className="text-center font-bold">{r.points}</td>
              <td className="text-center">{r.played}</td>
              <td className="text-center">{r.wins}</td>
              <td className="text-center">{r.draws}</td>
              <td className="text-center">{r.losses}</td>
              <td className="text-center">{r.gf}</td>
              <td className="text-center">{r.ga}</td>
              <td className="text-center">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> Classificado</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" /> 3º (disputa vaga)</span>
      </div>
    </div>
  );
}

/* ------------ Section standings (all groups grid) ------------ */
function SectionStandings({ standings }: { standings: ReturnType<typeof computeStandings> }) {
  return (
    <section>
      <SectionTitle n="02 — Tabela completa" title="Classificação dos 12 grupos" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GROUP_LETTERS.map(g => (
          <div
            key={g}
            className="rounded-xl border border-border p-4"
            style={{ backgroundImage: "var(--gradient-card)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">Grupo {g}</h3>
              <span className="text-xs text-muted-foreground">{GROUPS[g].length} seleções</span>
            </div>
            <MiniStandingsTable rows={standings[g]} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------ Thirds ------------ */
function SectionThirds({ thirds }: { thirds: ReturnType<typeof rankThirds> }) {
  return (
    <section>
      <SectionTitle
        n="03 — Repescagem dos terceiros"
        title="Ranking dos terceiros colocados"
        subtitle={thirds.length === 0
          ? "Conclua todos os jogos da fase de grupos para ver o ranking."
          : "Os 8 melhores avançam ao mata-mata de 32."}
      />
      {thirds.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground"
          style={{ backgroundImage: "var(--gradient-card)" }}
        >
          Aguardando resultados...
        </div>
      ) : (
        <div
          className="rounded-xl border border-border overflow-hidden"
          style={{ backgroundImage: "var(--gradient-card)" }}
        >
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase bg-background/30">
              <tr>
                <th className="text-left p-3">#</th>
                <th className="text-left">Seleção</th>
                <th className="text-left">Grupo</th>
                <th>Pts</th><th>SG</th><th>GP</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {thirds.map((t, i) => {
                const qualified = i < 8;
                return (
                  <tr key={t.team} className={`border-t border-border ${t.team === BRAZIL ? "bg-brazil/10" : ""}`}>
                    <td className="p-3 font-bold">{i + 1}</td>
                    <td className={`font-medium ${t.team === BRAZIL ? "text-brazil" : ""}`}>{t.team}</td>
                    <td>{t.group}</td>
                    <td className="text-center font-bold">{t.points}</td>
                    <td className="text-center">{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
                    <td className="text-center">{t.gf}</td>
                    <td>
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                        qualified ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"
                      }`}>
                        {qualified ? "Classificado" : "Eliminado"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------ Knockout ------------ */
function SectionKnockout({
  knockout, updateKnockoutScore, setPenWinner,
}: {
  knockout: Record<number, KnockoutMatch>;
  updateKnockoutScore: (id: number, side: "home" | "away", val: string) => void;
  setPenWinner: (id: number, w: "home" | "away" | null) => void;
}) {
  const rounds = ["32-avos", "Oitavas", "Quartas", "Semifinal", "Final"];
  return (
    <section>
      <SectionTitle n="04 — Mata-mata" title="Chaveamento" subtitle="Vencedores avançam automaticamente. Em empates, defina o vencedor por pênaltis." />
      <div className="space-y-8">
        {rounds.map(r => {
          const matches = KNOCKOUT_REFS.filter(x => x.round === r).map(x => knockout[x.id]);
          return (
            <div key={r}>
              <h3 className="text-xl font-bold mb-3">{r}</h3>
              <div className={`grid gap-3 ${
                r === "32-avos" ? "sm:grid-cols-2 xl:grid-cols-4" :
                r === "Oitavas" ? "sm:grid-cols-2 xl:grid-cols-4" :
                r === "Quartas" ? "sm:grid-cols-2 xl:grid-cols-4" :
                r === "Semifinal" ? "sm:grid-cols-2" :
                "max-w-xl mx-auto"
              }`}>
                {matches.map(m => (
                  <KnockoutCard key={m.id} m={m} onScore={updateKnockoutScore} onPen={setPenWinner} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function KnockoutCard({
  m, onScore, onPen,
}: {
  m: KnockoutMatch;
  onScore: (id: number, side: "home" | "away", val: string) => void;
  onPen: (id: number, w: "home" | "away" | null) => void;
}) {
  const winner = winnerOf(m);
  const drawn = m.home && m.away && m.homeScore != null && m.awayScore != null && m.homeScore === m.awayScore;
  const canEdit = !!(m.home && m.away);
  return (
    <div
      className={`rounded-lg border p-3 ${winner ? "border-primary/60" : "border-border"}`}
      style={{ backgroundImage: "var(--gradient-card)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Jogo {m.id}</span>
        {winner && <span className="text-[10px] uppercase tracking-wider text-primary font-bold">→ {winner}</span>}
      </div>
      <KnockoutRow team={m.home} ref_={m.homeRef} score={m.homeScore} onChange={v => onScore(m.id, "home", v)} disabled={!canEdit} isWinner={winner === m.home} />
      <KnockoutRow team={m.away} ref_={m.awayRef} score={m.awayScore} onChange={v => onScore(m.id, "away", v)} disabled={!canEdit} isWinner={winner === m.away} />
      {drawn && (
        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">Pênaltis:</span>
          <div className="flex gap-1">
            <button
              onClick={() => onPen(m.id, "home")}
              className={`text-[11px] rounded px-2 py-1 ${m.penWinner === "home" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}
            >{m.home}</button>
            <button
              onClick={() => onPen(m.id, "away")}
              className={`text-[11px] rounded px-2 py-1 ${m.penWinner === "away" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}
            >{m.away}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function KnockoutRow({
  team, ref_, score, onChange, disabled, isWinner,
}: {
  team: string | null;
  ref_: string;
  score: number | null;
  onChange: (v: string) => void;
  disabled: boolean;
  isWinner: boolean;
}) {
  const isBr = team === BRAZIL;
  return (
    <div className={`flex items-center justify-between gap-2 py-1.5 ${isWinner ? "font-bold" : ""}`}>
      <div className="min-w-0 flex items-center gap-2">
        {isBr && <BrazilDot />}
        <span className={`truncate text-sm ${team ? (isBr ? "text-brazil" : "text-foreground") : "text-muted-foreground italic"}`}>
          {team ?? `A definir (${ref_})`}
        </span>
      </div>
      <input
        type="number"
        min={0}
        max={99}
        disabled={disabled}
        value={score ?? ""}
        onChange={e => onChange(e.target.value)}
        className="w-12 rounded border border-input bg-background px-1 py-1 text-center text-sm font-bold disabled:opacity-40"
        placeholder="-"
      />
    </div>
  );
}

/* ------------ Champion ------------ */
function SectionChampion({ champion }: { champion: string | null }) {
  return (
    <section>
      <SectionTitle n="05 — Glória eterna" title="Campeão" />
      <div
        className={`rounded-2xl border p-10 text-center ${champion ? "border-primary" : "border-dashed border-border"}`}
        style={{
          backgroundImage: "var(--gradient-card)",
          boxShadow: champion ? "var(--shadow-glow)" : undefined,
        }}
      >
        {champion ? (
          <>
            <div className="text-6xl mb-3">🏆</div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent">Campeão Mundial 2026</p>
            <p className={`mt-2 text-5xl sm:text-7xl font-bold ${champion === BRAZIL ? "text-brazil" : "text-primary"}`}>
              {champion}
            </p>
          </>
        ) : (
          <>
            <div className="text-5xl mb-3 opacity-40">🏆</div>
            <p className="text-muted-foreground">Complete o mata-mata para coroar o campeão.</p>
          </>
        )}
      </div>
    </section>
  );
}
