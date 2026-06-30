// Puxa resultados reais da Copa do Mundo 2026 em tempo real.
// Fonte: API pública da ESPN (gratuita, sem chave, CORS liberado) — a mesma
// base que alimenta os placares ao vivo (inclusive os que o Google exibe).

import {
  type GroupMatch,
  type KnockoutMatch,
  KNOCKOUT_REFS,
  computeStandings,
  rankThirds,
  assignThirds,
  deriveThirdAssign,
  populateKnockout,
} from "./worldcup";

// Janela do torneio: abertura 11/jun → final 19/jul/2026.
// O endpoint aceita um intervalo de datas e devolve o torneio inteiro num único request.
const TOURNAMENT_RANGE = "20260611-20260719";
const ESPN_URL =
  `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${TOURNAMENT_RANGE}`;

// Nomes da ESPN (inglês) → nomes do simulador (português).
const EN_TO_PT: Record<string, string> = {
  Mexico: "México",
  "South Korea": "Coreia do Sul",
  Czechia: "Tchéquia",
  "South Africa": "África do Sul",
  Canada: "Canadá",
  Switzerland: "Suíça",
  "Bosnia-Herzegovina": "Bósnia e Herzegovina",
  Qatar: "Catar",
  Brazil: "Brasil",
  Morocco: "Marrocos",
  Scotland: "Escócia",
  Haiti: "Haiti",
  "United States": "Estados Unidos",
  Australia: "Austrália",
  Paraguay: "Paraguai",
  Türkiye: "Turquia",
  Germany: "Alemanha",
  "Ivory Coast": "Costa do Marfim",
  Ecuador: "Equador",
  Curaçao: "Curaçao",
  Netherlands: "Holanda",
  Japan: "Japão",
  Sweden: "Suécia",
  Tunisia: "Tunísia",
  Belgium: "Bélgica",
  Egypt: "Egito",
  Iran: "Irã",
  "New Zealand": "Nova Zelândia",
  Spain: "Espanha",
  Uruguay: "Uruguai",
  "Saudi Arabia": "Arábia Saudita",
  "Cape Verde": "Cabo Verde",
  France: "França",
  Senegal: "Senegal",
  Iraq: "Iraque",
  Norway: "Noruega",
  Argentina: "Argentina",
  Algeria: "Argélia",
  Austria: "Áustria",
  Jordan: "Jordânia",
  Portugal: "Portugal",
  "Congo DR": "Congo DR",
  Uzbekistan: "Uzbequistão",
  Colombia: "Colômbia",
  England: "Inglaterra",
  Croatia: "Croácia",
  Ghana: "Gana",
  Panama: "Panamá",
};

export interface RealResult {
  home: string; // nome em português
  away: string; // nome em português
  homeScore: number;
  awayScore: number;
  winner: string | null; // vencedor (resolve mata-mata decidido nos pênaltis)
  live: boolean;
  completed: boolean;
}

// Indexado por par de seleções (independe de quem é mandante).
export type ResultIndex = Map<string, RealResult>;

const pairKey = (a: string, b: string) => [a, b].sort().join(" :: ");

export interface FetchSummary {
  index: ResultIndex;
  fetched: number; // jogos com placar (encerrados + ao vivo)
  live: number;
  unmapped: string[]; // nomes da ESPN sem correspondência (diagnóstico)
  // Confrontos reais das oitavas-de-32 (mesmo os ainda não iniciados, que já
  // vêm com as seleções definidas). Usados para ler a alocação oficial dos
  // terceiros colocados direto da fonte. Pares em português.
  r32: [string, string][];
}

export async function fetchRealResults(): Promise<FetchSummary> {
  const res = await fetch(ESPN_URL);
  if (!res.ok) throw new Error(`ESPN respondeu ${res.status}`);
  const data = await res.json();
  const events: any[] = data?.events ?? [];

  const index: ResultIndex = new Map();
  const unmapped = new Set<string>();
  const r32: [string, string][] = [];
  let fetched = 0;
  let live = 0;

  for (const ev of events) {
    const comp = ev?.competitions?.[0];
    const cs: any[] = comp?.competitors ?? [];
    const homeC = cs.find((c) => c.homeAway === "home");
    const awayC = cs.find((c) => c.homeAway === "away");
    if (!homeC || !awayC) continue;

    const state = ev?.status?.type?.state as string | undefined; // 'pre' | 'in' | 'post'
    const homeEn = homeC.team?.displayName;
    const awayEn = awayC.team?.displayName;
    const home = EN_TO_PT[homeEn];
    const away = EN_TO_PT[awayEn];

    // Confrontos da R32 já vêm com as seleções definidas mesmo antes de começar
    // (`season.slug === "round-of-32"`). Capturamos todos — inclusive os "pre" —
    // para derivar a alocação oficial dos terceiros. Jogos com placeholders
    // ("Group H Winner") simplesmente não mapeiam e são ignorados.
    if (ev?.season?.slug === "round-of-32" && home && away) {
      r32.push([home, away]);
    }

    // Para o índice de placares, pula jogos que ainda não começaram (no mata-mata
    // vêm com placeholders do tipo "Round of 32 X Winner" no lugar das seleções).
    if (state === "pre") continue;

    if (!home) unmapped.add(homeEn);
    if (!away) unmapped.add(awayEn);
    if (!home || !away) continue;

    const hs = parseInt(homeC.score, 10);
    const as = parseInt(awayC.score, 10);
    if (Number.isNaN(hs) || Number.isNaN(as)) continue;

    const isLive = state === "in";
    let winner: string | null = null;
    if (homeC.winner === true) winner = home;
    else if (awayC.winner === true) winner = away;

    index.set(pairKey(home, away), {
      home,
      away,
      homeScore: hs,
      awayScore: as,
      winner,
      live: isLive,
      completed: ev?.status?.type?.completed === true,
    });
    fetched++;
    if (isLive) live++;
  }

  return { index, fetched, live, unmapped: [...unmapped], r32 };
}

// Aplica os resultados reais ao estado do simulador: preenche os jogos da fase
// de grupos e propaga o mata-mata rodada a rodada (recalculando classificação,
// terceiros e vencedores), exatamente como a edição manual faria.
export function applyRealResults(
  matches: GroupMatch[],
  knockout: Record<number, KnockoutMatch>,
  index: ResultIndex,
  project = false,
  r32Fixtures: [string, string][] = [],
): { matches: GroupMatch[]; knockout: Record<number, KnockoutMatch> } {
  // 1) Fase de grupos: orienta o placar conforme o mandante do simulador.
  const newMatches = matches.map((m) => {
    const r = index.get(pairKey(m.home, m.away));
    if (!r) return m;
    return {
      ...m,
      homeScore: r.home === m.home ? r.homeScore : r.awayScore,
      awayScore: r.home === m.home ? r.awayScore : r.homeScore,
    };
  });

  // 2) Recalcula a classificação e popula os confrontos do mata-mata.
  const standings = computeStandings(newMatches);
  const thirds = rankThirds(standings, project);
  // Prefere a alocação oficial lida da R32 real; cai no guloso se indisponível.
  const assign = deriveThirdAssign(standings, r32Fixtures) ?? assignThirds(thirds);
  let ko = populateKnockout(standings, assign, knockout, project);

  // 3) Preenche o mata-mata rodada a rodada; re-popular após cada rodada
  //    propaga os vencedores para a rodada seguinte (placares são preservados,
  //    pois as seleções dos slots já não mudam).
  const rounds = ["32-avos", "Oitavas", "Quartas", "Semifinal", "Final"];
  for (const round of rounds) {
    const ids = KNOCKOUT_REFS.filter((r) => r.round === round).map((r) => r.id);
    const next = { ...ko };
    for (const id of ids) {
      const m = next[id];
      if (!m.home || !m.away) continue;
      const r = index.get(pairKey(m.home, m.away));
      if (!r) continue;
      const homeScore = r.home === m.home ? r.homeScore : r.awayScore;
      const awayScore = r.home === m.home ? r.awayScore : r.homeScore;
      let penWinner: "home" | "away" | null = null;
      if (homeScore === awayScore && r.winner) {
        penWinner = r.winner === m.home ? "home" : "away";
      }
      next[id] = { ...m, homeScore, awayScore, penWinner };
    }
    ko = populateKnockout(standings, assign, next, project);
  }

  return { matches: newMatches, knockout: ko };
}
