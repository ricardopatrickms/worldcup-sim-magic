import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  GROUPS,
  GROUP_LETTERS,
  type GroupLetter,
  type GroupMatch,
  type KnockoutMatch,
  generateGroupMatches,
  computeStandings,
  rankThirds,
  assignThirds,
  buildEmptyKnockout,
  populateKnockout,
  winnerOf,
  sampleScores,
} from "@/lib/worldcup";
import { fetchRealResults, applyRealResults } from "@/lib/results-espn";
import { flagUrl } from "@/lib/flags";

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
const PROJECT_KEY = "wc2026-project-ko-v1";
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
  const [realStatus, setRealStatus] = useState<{ kind: "idle" | "loading" | "ok" | "error"; msg: string }>({ kind: "idle", msg: "" });
  const [projectKO, setProjectKO] = useState(true);

  useEffect(() => {
    setState(loadState());
    try {
      const p = localStorage.getItem(PROJECT_KEY);
      if (p != null) setProjectKO(p === "1");
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(PROJECT_KEY, projectKO ? "1" : "0"); } catch {}
  }, [projectKO, hydrated]);

  const standings = useMemo(() => computeStandings(state.matches), [state.matches]);
  const thirds = useMemo(() => rankThirds(standings, projectKO), [standings, projectKO]);
  const thirdAssign = useMemo(() => assignThirds(thirds), [thirds]);
  // Os 8 melhores terceiros que se classificam ao mata-mata.
  const qualifiedThirds = useMemo(() => new Set(thirds.slice(0, 8).map(t => t.team)), [thirds]);

  // Recompute knockout slots when group data changes
  useEffect(() => {
    setState(s => {
      const next = populateKnockout(standings, thirdAssign, s.knockout, projectKO);
      // shallow compare to avoid loop
      const changed = Object.keys(next).some(k => {
        const a = next[+k], b = s.knockout[+k];
        return !b || a.home !== b.home || a.away !== b.away ||
          a.homeScore !== b.homeScore || a.awayScore !== b.awayScore || a.penWinner !== b.penWinner;
      });
      return changed ? { ...s, knockout: next } : s;
    });
  }, [standings, thirdAssign, projectKO, state.knockout]);

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

  // Clicar na bandeira/time avança ele (alterna se clicar de novo no mesmo).
  const pickWinner = (id: number, side: "home" | "away") => {
    setState(s => {
      const m = s.knockout[id];
      if (!m.home || !m.away) return s;
      const manualWinner = m.manualWinner === side ? null : side;
      return { ...s, knockout: { ...s.knockout, [id]: { ...m, manualWinner } } };
    });
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

  const pullRealResults = async () => {
    setRealStatus({ kind: "loading", msg: "Buscando resultados reais..." });
    try {
      const { index, fetched, live, unmapped } = await fetchRealResults();
      if (fetched === 0) {
        setRealStatus({ kind: "error", msg: "Nenhum resultado disponível ainda." });
        return;
      }
      setState(s => applyRealResults(s.matches, s.knockout, index, projectKO));
      if (unmapped.length) console.warn("Seleções não mapeadas (ESPN):", unmapped);
      setRealStatus({
        kind: "ok",
        msg: `${fetched} jogos atualizados${live ? ` · ${live} ao vivo` : ""}.`,
      });
    } catch (e) {
      setRealStatus({ kind: "error", msg: `Falha: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const groupsComplete = GROUP_LETTERS.every(g => standings[g].every(s => s.played === 3));
  const koProvisional = projectKO && !groupsComplete && GROUP_LETTERS.some(g => standings[g].some(s => s.played > 0));

  return (
    <div className="min-h-screen">
      <Header
        onReset={reset}
        onSample={fillSample}
        onPullReal={pullRealResults}
        realStatus={realStatus}
        projectKO={projectKO}
        onToggleProject={() => setProjectKO(v => !v)}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 space-y-12">
        <SectionGroups
          state={state}
          activeGroup={activeGroup}
          setActiveGroup={setActiveGroup}
          standings={standings}
          updateGroupScore={updateGroupScore}
          qualifiedThirds={qualifiedThirds}
        />
        <SectionStandings standings={standings} qualifiedThirds={qualifiedThirds} />
        <SectionKnockout
          knockout={state.knockout}
          updateKnockoutScore={updateKnockoutScore}
          setPenWinner={setPenWinner}
          pickWinner={pickWinner}
          provisional={koProvisional}
        />
      </main>
      <footer className="mx-auto max-w-7xl px-4 py-8 text-center text-sm text-muted-foreground">
        Simulador não oficial. Dados salvos automaticamente no seu navegador.
      </footer>
    </div>
  );
}

/* ------------ Header ------------ */
function Header({
  onReset, onSample, onPullReal, realStatus, projectKO, onToggleProject,
}: {
  onReset: () => void;
  onSample: () => void;
  onPullReal: () => void;
  realStatus: { kind: "idle" | "loading" | "ok" | "error"; msg: string };
  projectKO: boolean;
  onToggleProject: () => void;
}) {
  const loading = realStatus.kind === "loading";
  const statusColor =
    realStatus.kind === "ok" ? "text-success"
    : realStatus.kind === "error" ? "text-destructive"
    : "text-muted-foreground";
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
        <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onPullReal}
              disabled={loading}
              className="rounded-md bg-primary px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-primary-foreground hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? "Atualizando..." : "Resultados reais"}
            </button>
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
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={projectKO}
              onChange={onToggleProject}
              className="h-3.5 w-3.5 accent-primary"
            />
            Projetar mata-mata com as posições atuais
          </label>
          {realStatus.msg && (
            <p className={`text-xs ${statusColor}`}>{realStatus.msg}</p>
          )}
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
  state, activeGroup, setActiveGroup, standings, updateGroupScore, qualifiedThirds,
}: {
  state: State;
  activeGroup: GroupLetter;
  setActiveGroup: (g: GroupLetter) => void;
  standings: ReturnType<typeof computeStandings>;
  updateGroupScore: (id: string, side: "home" | "away", val: string) => void;
  qualifiedThirds: Set<string>;
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
          <MiniStandingsTable rows={standings[activeGroup]} qualifiedThirds={qualifiedThirds} />
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
      {align === "left" && <Flag name={name} />}
      {align === "left" && isBr && <BrazilDot />}
      <span className={`truncate font-medium ${isBr ? "text-brazil font-bold" : ""}`}>{name}</span>
      {align === "right" && isBr && <BrazilDot />}
      {align === "right" && <Flag name={name} />}
    </div>
  );
}
function BrazilDot() {
  return <span className="inline-block h-2 w-2 rounded-full bg-brazil shrink-0" />;
}

/* ------------ Flag ------------ */
function Flag({ name, className = "h-4 w-6" }: { name: string | null | undefined; className?: string }) {
  const url = flagUrl(name);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={name ?? ""}
      loading="lazy"
      width={24}
      height={16}
      className={`inline-block shrink-0 rounded-none border border-border object-cover ${className}`}
    />
  );
}

/* ------------ Mini standings (inside group section) ------------ */
function MiniStandingsTable({ rows, qualifiedThirds }: {
  rows: ReturnType<typeof computeStandings>[GroupLetter];
  qualifiedThirds: Set<string>;
}) {
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
          {rows.map((r, i) => {
            const isThird = i === 2;
            const thirdQualifies = isThird && qualifiedThirds.has(r.team);
            const qualified = i < 2 || thirdQualifies;
            const badgeCls = qualified
              ? "bg-success text-success-foreground"
              : isThird
                ? "bg-warning text-warning-foreground"
                : "bg-muted text-muted-foreground";
            const rowCls = r.team === BRAZIL ? "bg-brazil/10" : qualified ? "bg-success/10" : "";
            return (
              <tr key={r.team} className={`border-t border-border ${rowCls}`}>
                <td className="py-2">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${badgeCls}`}>{i + 1}</span>
                </td>
                <td className={`font-medium ${r.team === BRAZIL ? "text-brazil" : ""}`}>
                  <span className="flex items-center gap-2 min-w-0">
                    <Flag name={r.team} />
                    <span className="truncate">{r.team}</span>
                    {thirdQualifies && (
                      <span title="Entre os 8 melhores terceiros" className="shrink-0 rounded bg-success/15 px-1 text-[10px] font-semibold text-success">
                        3º ✓
                      </span>
                    )}
                  </span>
                </td>
                <td className="text-center font-bold">{r.points}</td>
                <td className="text-center">{r.played}</td>
                <td className="text-center">{r.wins}</td>
                <td className="text-center">{r.draws}</td>
                <td className="text-center">{r.losses}</td>
                <td className="text-center">{r.gf}</td>
                <td className="text-center">{r.ga}</td>
                <td className="text-center">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> 1º, 2º e 3º classificando</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" /> 3º fora da repescagem</span>
      </div>
    </div>
  );
}

/* ------------ Section standings (all groups grid) ------------ */
function SectionStandings({ standings, qualifiedThirds }: {
  standings: ReturnType<typeof computeStandings>;
  qualifiedThirds: Set<string>;
}) {
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
            <MiniStandingsTable rows={standings[g]} qualifiedThirds={qualifiedThirds} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------ Knockout ------------ */
function SectionKnockout({
  knockout, updateKnockoutScore, setPenWinner, pickWinner, provisional,
}: {
  knockout: Record<number, KnockoutMatch>;
  updateKnockoutScore: (id: number, side: "home" | "away", val: string) => void;
  setPenWinner: (id: number, w: "home" | "away" | null) => void;
  pickWinner: (id: number, side: "home" | "away") => void;
  provisional: boolean;
}) {
  return (
    <section>
      <SectionTitle n="03 — Mata-mata" title="Chaveamento" subtitle="Clique na bandeira/seleção para avançá-la à próxima fase, ou edite o placar. Em empates, escolha o vencedor por pênaltis." />
      {provisional && (
        <div className="mb-5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          ⚠️ Projeção provisória — montada com as posições atuais dos grupos (fase de grupos ainda em andamento). Muda conforme os próximos jogos saem.
        </div>
      )}
      <div className="overflow-x-auto pb-4">
        <div className="flex items-stretch justify-center min-w-max">
          <BracketNode id={101} side="left" knockout={knockout} onScore={updateKnockoutScore} onPen={setPenWinner} onPick={pickWinner} />
          <FinalCenter knockout={knockout} onScore={updateKnockoutScore} onPen={setPenWinner} onPick={pickWinner} />
          <BracketNode id={102} side="right" knockout={knockout} onScore={updateKnockoutScore} onPen={setPenWinner} onPick={pickWinner} />
        </div>
      </div>
    </section>
  );
}

// Árvore do mata-mata: cada jogo aponta para os dois que o alimentam.
const KO_CHILDREN: Record<number, [number, number]> = {
  89: [73, 75], 90: [74, 77], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100], 104: [101, 102],
};

// Nó recursivo do chaveamento. O flexbox (items-center) centraliza cada jogo
// no ponto médio dos dois jogos que o alimentam, montando o bracket sozinho.
function BracketNode({
  id, side, knockout, onScore, onPen, onPick,
}: {
  id: number;
  side: "left" | "right";
  knockout: Record<number, KnockoutMatch>;
  onScore: (id: number, s: "home" | "away", v: string) => void;
  onPen: (id: number, w: "home" | "away" | null) => void;
  onPick: (id: number, side: "home" | "away") => void;
}) {
  const kids = KO_CHILDREN[id];
  const card = (
    <div className="w-28 lg:w-32 shrink-0">
      <KnockoutCard m={knockout[id]} onScore={onScore} onPen={onPen} onPick={onPick} />
    </div>
  );
  if (!kids) return card;

  const children = (
    <div className="flex items-stretch">
      {side === "right" && <Connector side="right" />}
      <div className="flex flex-col justify-center gap-1.5">
        <BracketNode id={kids[0]} side={side} knockout={knockout} onScore={onScore} onPen={onPen} onPick={onPick} />
        <BracketNode id={kids[1]} side={side} knockout={knockout} onScore={onScore} onPen={onPen} onPick={onPick} />
      </div>
      {side === "left" && <Connector side="left" />}
    </div>
  );

  return (
    <div className="flex items-center">
      {side === "left" ? <>{children}{card}</> : <>{card}{children}</>}
    </div>
  );
}

// Conector em "cotovelo": barra vertical ligando o par + linha horizontal até o jogo seguinte.
function Connector({ side }: { side: "left" | "right" }) {
  return (
    <div className="relative w-2 self-stretch">
      <div className={`absolute top-1/4 h-1/2 border-border ${side === "left" ? "left-0 border-l-2" : "right-0 border-r-2"}`} />
      <div className="absolute left-0 right-0 top-1/2 border-t-2 border-border" />
    </div>
  );
}

// Centro do bracket: troféu + final, com conectores para as duas semifinais.
function FinalCenter({
  knockout, onScore, onPen, onPick,
}: {
  knockout: Record<number, KnockoutMatch>;
  onScore: (id: number, s: "home" | "away", v: string) => void;
  onPen: (id: number, w: "home" | "away" | null) => void;
  onPick: (id: number, side: "home" | "away") => void;
}) {
  const champion = winnerOf(knockout[104]);
  return (
    <div className="flex items-center self-stretch">
      <div className="w-2 self-center border-t-2 border-border" />
      <div className="flex flex-col items-center justify-center gap-1.5 px-1">
        <div className="text-3xl lg:text-4xl drop-shadow" title="Final">🏆</div>
        <div className="text-[9px] uppercase tracking-[0.2em] text-accent">Final</div>
        <div className="w-28 lg:w-32 shrink-0">
          <KnockoutCard m={knockout[104]} onScore={onScore} onPen={onPen} onPick={onPick} />
        </div>
        {champion && (
          <div className="flex items-center gap-1.5">
            <Flag name={champion} />
            <span className={`text-xs font-bold ${champion === BRAZIL ? "text-brazil" : "text-primary"}`}>{champion}</span>
          </div>
        )}
      </div>
      <div className="w-2 self-center border-t-2 border-border" />
    </div>
  );
}

function KnockoutCard({
  m, onScore, onPen, onPick,
}: {
  m: KnockoutMatch;
  onScore: (id: number, side: "home" | "away", val: string) => void;
  onPen: (id: number, w: "home" | "away" | null) => void;
  onPick: (id: number, side: "home" | "away") => void;
}) {
  const winner = winnerOf(m);
  const drawn = m.home && m.away && m.homeScore != null && m.awayScore != null && m.homeScore === m.awayScore;
  const canEdit = !!(m.home && m.away);
  return (
    <div
      className={`rounded-md border p-1.5 ${winner ? "border-primary/60" : "border-border"}`}
      style={{ backgroundImage: "var(--gradient-card)" }}
    >
      <KnockoutRow team={m.home} ref_={m.homeRef} score={m.homeScore} onChange={v => onScore(m.id, "home", v)} onPick={() => onPick(m.id, "home")} canPick={canEdit} disabled={!canEdit} isWinner={winner === m.home} />
      <KnockoutRow team={m.away} ref_={m.awayRef} score={m.awayScore} onChange={v => onScore(m.id, "away", v)} onPick={() => onPick(m.id, "away")} canPick={canEdit} disabled={!canEdit} isWinner={winner === m.away} />
      {drawn && (
        <div className="mt-1 pt-1 border-t border-border flex gap-1">
          <button
            onClick={() => onPen(m.id, "home")}
            title={`Pênaltis: ${m.home}`}
            className={`flex-1 truncate text-[9px] rounded px-1 py-0.5 ${m.penWinner === "home" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}
          >P {m.home}</button>
          <button
            onClick={() => onPen(m.id, "away")}
            title={`Pênaltis: ${m.away}`}
            className={`flex-1 truncate text-[9px] rounded px-1 py-0.5 ${m.penWinner === "away" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}
          >P {m.away}</button>
        </div>
      )}
    </div>
  );
}

function KnockoutRow({
  team, ref_, score, onChange, onPick, canPick, disabled, isWinner,
}: {
  team: string | null;
  ref_: string;
  score: number | null;
  onChange: (v: string) => void;
  onPick: () => void;
  canPick: boolean;
  disabled: boolean;
  isWinner: boolean;
}) {
  const isBr = team === BRAZIL;
  return (
    <div className={`flex items-center gap-1 py-1 ${isWinner ? "font-bold" : ""}`}>
      <button
        type="button"
        onClick={canPick ? onPick : undefined}
        disabled={!canPick}
        title={canPick ? `Avançar ${team}` : (team ?? `A definir — ${ref_}`)}
        className={`min-w-0 flex-1 flex items-center gap-1 text-left ${canPick ? "cursor-pointer hover:opacity-70" : "cursor-default"}`}
      >
        <Flag name={team} className="h-3.5 w-5" />
        <span
          className={`min-w-0 flex-1 truncate text-[11px] leading-tight ${team ? (isBr ? "text-brazil" : "text-foreground") : "text-muted-foreground italic"}`}
        >
          {team ?? "—"}
        </span>
        {isWinner && team && <span className="shrink-0 text-[10px] text-primary">▸</span>}
      </button>
      <input
        type="number"
        min={0}
        max={99}
        disabled={disabled}
        value={score ?? ""}
        onChange={e => onChange(e.target.value)}
        className="w-7 shrink-0 rounded border border-input bg-background px-0.5 py-0.5 text-center text-xs font-bold disabled:opacity-40"
        placeholder="-"
      />
    </div>
  );
}

