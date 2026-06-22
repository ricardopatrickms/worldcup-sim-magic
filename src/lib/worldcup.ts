// World Cup 2026 simulator logic

export type GroupLetter =
  | "A" | "B" | "C" | "D" | "E" | "F"
  | "G" | "H" | "I" | "J" | "K" | "L";

export const GROUP_LETTERS: GroupLetter[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
];

export const GROUPS: Record<GroupLetter, string[]> = {
  A: ["México", "Coreia do Sul", "Tchéquia", "África do Sul"],
  B: ["Canadá", "Suíça", "Bósnia e Herzegovina", "Catar"],
  C: ["Brasil", "Marrocos", "Escócia", "Haiti"],
  D: ["Estados Unidos", "Austrália", "Paraguai", "Turquia"],
  E: ["Alemanha", "Costa do Marfim", "Equador", "Curaçao"],
  F: ["Holanda", "Japão", "Suécia", "Tunísia"],
  G: ["Bélgica", "Egito", "Irã", "Nova Zelândia"],
  H: ["Espanha", "Uruguai", "Arábia Saudita", "Cabo Verde"],
  I: ["França", "Senegal", "Iraque", "Noruega"],
  J: ["Argentina", "Argélia", "Áustria", "Jordânia"],
  K: ["Portugal", "Congo DR", "Uzbequistão", "Colômbia"],
  L: ["Inglaterra", "Croácia", "Gana", "Panamá"],
};

export interface GroupMatch {
  id: string;
  group: GroupLetter;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface KnockoutMatch {
  id: number; // 73..104
  homeRef: string; // descriptive ref (e.g. "2º A", "Vencedor Jogo 73", "3º de A/B/C/D/F")
  awayRef: string;
  home: string | null;
  away: string | null;
  homeScore: number | null;
  awayScore: number | null;
  // for draws in knockout, allow penalty winner
  penWinner?: "home" | "away" | null;
  // manual pick (clicar na bandeira) para avançar um time sem placar
  manualWinner?: "home" | "away" | null;
}

export interface Standing {
  team: string;
  group: GroupLetter;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  position: number;
}

export function generateGroupMatches(): GroupMatch[] {
  const matches: GroupMatch[] = [];
  for (const g of GROUP_LETTERS) {
    const teams = GROUPS[g];
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matches.push({
          id: `${g}-${i}-${j}`,
          group: g,
          home: teams[i],
          away: teams[j],
          homeScore: null,
          awayScore: null,
        });
      }
    }
  }
  return matches;
}

export function computeStandings(matches: GroupMatch[]): Record<GroupLetter, Standing[]> {
  const result = {} as Record<GroupLetter, Standing[]>;
  for (const g of GROUP_LETTERS) {
    const base: Record<string, Standing> = {};
    for (const t of GROUPS[g]) {
      base[t] = {
        team: t, group: g, played: 0, wins: 0, draws: 0, losses: 0,
        gf: 0, ga: 0, gd: 0, points: 0, position: 0,
      };
    }
    const groupMatches = matches.filter(m => m.group === g);
    for (const m of groupMatches) {
      if (m.homeScore == null || m.awayScore == null) continue;
      const h = base[m.home], a = base[m.away];
      h.played++; a.played++;
      h.gf += m.homeScore; h.ga += m.awayScore;
      a.gf += m.awayScore; a.ga += m.homeScore;
      if (m.homeScore > m.awayScore) { h.wins++; a.losses++; h.points += 3; }
      else if (m.homeScore < m.awayScore) { a.wins++; h.losses++; a.points += 3; }
      else { h.draws++; a.draws++; h.points++; a.points++; }
    }
    for (const t of Object.values(base)) t.gd = t.gf - t.ga;

    const arr = Object.values(base);
    arr.sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      if (y.gd !== x.gd) return y.gd - x.gd;
      if (y.gf !== x.gf) return y.gf - x.gf;
      // Head to head
      const direct = groupMatches.find(
        m => m.homeScore != null && m.awayScore != null &&
          ((m.home === x.team && m.away === y.team) || (m.home === y.team && m.away === x.team))
      );
      if (direct) {
        const xScore = direct.home === x.team ? direct.homeScore! : direct.awayScore!;
        const yScore = direct.home === y.team ? direct.homeScore! : direct.awayScore!;
        if (yScore !== xScore) return yScore - xScore;
      }
      // alphabetical fallback (fair play / draw)
      return x.team.localeCompare(y.team);
    });
    arr.forEach((s, i) => (s.position = i + 1));
    result[g] = arr;
  }
  return result;
}

// Best 8 third-placed teams.
// `provisional` ranks the current third-placed teams even before every group
// has finished (used for projetar o mata-mata com a fase de grupos em andamento).
export function rankThirds(
  standings: Record<GroupLetter, Standing[]>,
  provisional = false,
): Standing[] {
  const thirds = GROUP_LETTERS
    .map(g => standings[g][2])
    .filter(Boolean);
  if (!provisional) {
    // only rank those that have played all 3 matches
    const ready = thirds.filter(t => t.played === 3);
    if (ready.length < thirds.length) return [];
  }
  const sorted = [...thirds].sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.gd !== x.gd) return y.gd - x.gd;
    if (y.gf !== x.gf) return y.gf - x.gf;
    return x.team.localeCompare(y.team);
  });
  return sorted;
}

// Assignment of third-placed teams to matches 74..87.
// We follow a simple rule: pick from the qualifying-thirds (top 8) the first one
// whose group letter is in the allowed set and not yet used.
const THIRD_SLOTS: { matchId: number; allowed: GroupLetter[] }[] = [
  { matchId: 74, allowed: ["A", "B", "C", "D", "F"] },
  { matchId: 77, allowed: ["C", "D", "F", "G", "H"] },
  { matchId: 79, allowed: ["C", "E", "F", "H", "I"] },
  { matchId: 80, allowed: ["E", "H", "I", "J", "K"] },
  { matchId: 81, allowed: ["B", "E", "F", "I", "J"] },
  { matchId: 82, allowed: ["A", "E", "H", "I", "J"] },
  { matchId: 85, allowed: ["E", "F", "G", "I", "J"] },
  { matchId: 87, allowed: ["D", "E", "I", "J", "L"] },
];

export function assignThirds(
  topThirds: Standing[]
): Record<number, Standing | null> {
  const out: Record<number, Standing | null> = {};
  if (topThirds.length < 8) {
    THIRD_SLOTS.forEach(s => (out[s.matchId] = null));
    return out;
  }
  const eight = topThirds.slice(0, 8);
  const used = new Set<GroupLetter>();
  // Greedy: assign by slot order, picking the highest-ranked unused third whose group is allowed.
  for (const slot of THIRD_SLOTS) {
    const found = eight.find(t => !used.has(t.group) && slot.allowed.includes(t.group));
    if (found) {
      out[slot.matchId] = found;
      used.add(found.group);
    } else {
      out[slot.matchId] = null;
    }
  }
  // If greedy failed, try a brute permutation fallback
  if (Object.values(out).some(v => v == null)) {
    const perms: Standing[][] = [];
    const arr = eight.slice();
    const permute = (a: Standing[], k: number) => {
      if (k === a.length - 1) { perms.push(a.slice()); return; }
      for (let i = k; i < a.length; i++) {
        [a[k], a[i]] = [a[i], a[k]];
        permute(a, k + 1);
        [a[k], a[i]] = [a[i], a[k]];
      }
    };
    permute(arr, 0);
    for (const p of perms) {
      const candidate: Record<number, Standing> = {};
      let ok = true;
      for (let i = 0; i < THIRD_SLOTS.length; i++) {
        const slot = THIRD_SLOTS[i];
        const team = p[i];
        if (!slot.allowed.includes(team.group)) { ok = false; break; }
        candidate[slot.matchId] = team;
      }
      if (ok) {
        for (const slot of THIRD_SLOTS) out[slot.matchId] = candidate[slot.matchId];
        break;
      }
    }
  }
  return out;
}

// Knockout structure
export const KNOCKOUT_REFS: { id: number; homeRef: string; awayRef: string; round: string }[] = [
  // Round of 32
  { id: 73, homeRef: "2º Grupo A", awayRef: "2º Grupo B", round: "32-avos" },
  { id: 74, homeRef: "1º Grupo E", awayRef: "3º A/B/C/D/F", round: "32-avos" },
  { id: 75, homeRef: "1º Grupo F", awayRef: "2º Grupo C", round: "32-avos" },
  { id: 76, homeRef: "1º Grupo C", awayRef: "2º Grupo F", round: "32-avos" },
  { id: 77, homeRef: "1º Grupo I", awayRef: "3º C/D/F/G/H", round: "32-avos" },
  { id: 78, homeRef: "2º Grupo E", awayRef: "2º Grupo I", round: "32-avos" },
  { id: 79, homeRef: "1º Grupo A", awayRef: "3º C/E/F/H/I", round: "32-avos" },
  { id: 80, homeRef: "1º Grupo L", awayRef: "3º E/H/I/J/K", round: "32-avos" },
  { id: 81, homeRef: "1º Grupo D", awayRef: "3º B/E/F/I/J", round: "32-avos" },
  { id: 82, homeRef: "1º Grupo G", awayRef: "3º A/E/H/I/J", round: "32-avos" },
  { id: 83, homeRef: "2º Grupo K", awayRef: "2º Grupo L", round: "32-avos" },
  { id: 84, homeRef: "1º Grupo H", awayRef: "2º Grupo J", round: "32-avos" },
  { id: 85, homeRef: "1º Grupo B", awayRef: "3º E/F/G/I/J", round: "32-avos" },
  { id: 86, homeRef: "1º Grupo J", awayRef: "2º Grupo H", round: "32-avos" },
  { id: 87, homeRef: "1º Grupo K", awayRef: "3º D/E/I/J/L", round: "32-avos" },
  { id: 88, homeRef: "2º Grupo D", awayRef: "2º Grupo G", round: "32-avos" },
  // Oitavas
  { id: 89, homeRef: "Vencedor Jogo 73", awayRef: "Vencedor Jogo 75", round: "Oitavas" },
  { id: 90, homeRef: "Vencedor Jogo 74", awayRef: "Vencedor Jogo 77", round: "Oitavas" },
  { id: 91, homeRef: "Vencedor Jogo 76", awayRef: "Vencedor Jogo 78", round: "Oitavas" },
  { id: 92, homeRef: "Vencedor Jogo 79", awayRef: "Vencedor Jogo 80", round: "Oitavas" },
  { id: 93, homeRef: "Vencedor Jogo 83", awayRef: "Vencedor Jogo 84", round: "Oitavas" },
  { id: 94, homeRef: "Vencedor Jogo 81", awayRef: "Vencedor Jogo 82", round: "Oitavas" },
  { id: 95, homeRef: "Vencedor Jogo 86", awayRef: "Vencedor Jogo 88", round: "Oitavas" },
  { id: 96, homeRef: "Vencedor Jogo 85", awayRef: "Vencedor Jogo 87", round: "Oitavas" },
  // Quartas
  { id: 97, homeRef: "Vencedor Jogo 89", awayRef: "Vencedor Jogo 90", round: "Quartas" },
  { id: 98, homeRef: "Vencedor Jogo 93", awayRef: "Vencedor Jogo 94", round: "Quartas" },
  { id: 99, homeRef: "Vencedor Jogo 91", awayRef: "Vencedor Jogo 92", round: "Quartas" },
  { id: 100, homeRef: "Vencedor Jogo 95", awayRef: "Vencedor Jogo 96", round: "Quartas" },
  // Semis
  { id: 101, homeRef: "Vencedor Jogo 97", awayRef: "Vencedor Jogo 98", round: "Semifinal" },
  { id: 102, homeRef: "Vencedor Jogo 99", awayRef: "Vencedor Jogo 100", round: "Semifinal" },
  // Final
  { id: 104, homeRef: "Vencedor Jogo 101", awayRef: "Vencedor Jogo 102", round: "Final" },
];

export function buildEmptyKnockout(): Record<number, KnockoutMatch> {
  const m: Record<number, KnockoutMatch> = {};
  for (const r of KNOCKOUT_REFS) {
    m[r.id] = {
      id: r.id,
      homeRef: r.homeRef,
      awayRef: r.awayRef,
      home: null,
      away: null,
      homeScore: null,
      awayScore: null,
      penWinner: null,
      manualWinner: null,
    };
  }
  return m;
}

export function winnerOf(m: KnockoutMatch): string | null {
  if (!m.home || !m.away) return null;
  // Placar decide quando preenchido
  if (m.homeScore != null && m.awayScore != null) {
    if (m.homeScore > m.awayScore) return m.home;
    if (m.awayScore > m.homeScore) return m.away;
    if (m.penWinner === "home") return m.home;
    if (m.penWinner === "away") return m.away;
  }
  // Sem placar decisivo: usa a escolha manual (clique na bandeira)
  if (m.manualWinner === "home") return m.home;
  if (m.manualWinner === "away") return m.away;
  return null;
}

// Populate knockout slots from group results
export function populateKnockout(
  standings: Record<GroupLetter, Standing[]>,
  thirdAssign: Record<number, Standing | null>,
  existing: Record<number, KnockoutMatch>,
  project = false
): Record<number, KnockoutMatch> {
  const allGroupsComplete = GROUP_LETTERS.every(g => standings[g].every(s => s.played === 3));
  // Em modo projeção, monta o bracket com as posições atuais assim que houver
  // pelo menos um jogo disputado (evita projetar um bracket vazio/alfabético).
  const anyPlayed = GROUP_LETTERS.some(g => standings[g].some(s => s.played > 0));
  const shouldFill = allGroupsComplete || (project && anyPlayed);

  const next: Record<number, KnockoutMatch> = {};
  for (const r of KNOCKOUT_REFS) {
    const prev = existing[r.id];
    next[r.id] = { ...prev, id: r.id, homeRef: r.homeRef, awayRef: r.awayRef };
  }

  const firstOf = (g: GroupLetter) => standings[g][0]?.team ?? null;
  const secondOf = (g: GroupLetter) => standings[g][1]?.team ?? null;

  const setSlot = (id: number, side: "home" | "away", val: string | null) => {
    const prev = existing[id];
    const prevVal = side === "home" ? prev.home : prev.away;
    if (prevVal !== val) {
      // reset score if team changed
      next[id].homeScore = null;
      next[id].awayScore = null;
      next[id].penWinner = null;
      next[id].manualWinner = null;
    }
    if (side === "home") next[id].home = val;
    else next[id].away = val;
  };

  if (shouldFill) {
    // Direct slots
    setSlot(73, "home", secondOf("A")); setSlot(73, "away", secondOf("B"));
    setSlot(74, "home", firstOf("E"));  setSlot(74, "away", thirdAssign[74]?.team ?? null);
    setSlot(75, "home", firstOf("F"));  setSlot(75, "away", secondOf("C"));
    setSlot(76, "home", firstOf("C"));  setSlot(76, "away", secondOf("F"));
    setSlot(77, "home", firstOf("I"));  setSlot(77, "away", thirdAssign[77]?.team ?? null);
    setSlot(78, "home", secondOf("E")); setSlot(78, "away", secondOf("I"));
    setSlot(79, "home", firstOf("A"));  setSlot(79, "away", thirdAssign[79]?.team ?? null);
    setSlot(80, "home", firstOf("L"));  setSlot(80, "away", thirdAssign[80]?.team ?? null);
    setSlot(81, "home", firstOf("D"));  setSlot(81, "away", thirdAssign[81]?.team ?? null);
    setSlot(82, "home", firstOf("G"));  setSlot(82, "away", thirdAssign[82]?.team ?? null);
    setSlot(83, "home", secondOf("K")); setSlot(83, "away", secondOf("L"));
    setSlot(84, "home", firstOf("H"));  setSlot(84, "away", secondOf("J"));
    setSlot(85, "home", firstOf("B"));  setSlot(85, "away", thirdAssign[85]?.team ?? null);
    setSlot(86, "home", firstOf("J"));  setSlot(86, "away", secondOf("H"));
    setSlot(87, "home", firstOf("K"));  setSlot(87, "away", thirdAssign[87]?.team ?? null);
    setSlot(88, "home", secondOf("D")); setSlot(88, "away", secondOf("G"));
  } else {
    // clear group-derived slots
    for (const id of [73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88]) {
      setSlot(id, "home", null);
      setSlot(id, "away", null);
    }
  }

  // Propagate winners
  const winnerLinks: { id: number; homeFrom: number; awayFrom: number }[] = [
    { id: 89, homeFrom: 73, awayFrom: 75 },
    { id: 90, homeFrom: 74, awayFrom: 77 },
    { id: 91, homeFrom: 76, awayFrom: 78 },
    { id: 92, homeFrom: 79, awayFrom: 80 },
    { id: 93, homeFrom: 83, awayFrom: 84 },
    { id: 94, homeFrom: 81, awayFrom: 82 },
    { id: 95, homeFrom: 86, awayFrom: 88 },
    { id: 96, homeFrom: 85, awayFrom: 87 },
    { id: 97, homeFrom: 89, awayFrom: 90 },
    { id: 98, homeFrom: 93, awayFrom: 94 },
    { id: 99, homeFrom: 91, awayFrom: 92 },
    { id: 100, homeFrom: 95, awayFrom: 96 },
    { id: 101, homeFrom: 97, awayFrom: 98 },
    { id: 102, homeFrom: 99, awayFrom: 100 },
    { id: 104, homeFrom: 101, awayFrom: 102 },
  ];
  for (const link of winnerLinks) {
    const h = winnerOf(next[link.homeFrom]);
    const a = winnerOf(next[link.awayFrom]);
    setSlot(link.id, "home", h);
    setSlot(link.id, "away", a);
  }

  return next;
}

// Sample fill: deterministic plausible scores
export function sampleScores(seed: number): number {
  // pseudo-random 0..3
  const x = Math.sin(seed) * 10000;
  const r = x - Math.floor(x);
  return Math.floor(r * 4);
}
