// Bandeiras das seleções via flagcdn.com (gratuito, sem chave).
// Mapeia o nome em português → código ISO 3166-1 alfa-2 (com variações do
// Reino Unido para Inglaterra/Escócia).

const TEAM_CODE: Record<string, string> = {
  México: "mx",
  "Coreia do Sul": "kr",
  Tchéquia: "cz",
  "África do Sul": "za",
  Canadá: "ca",
  Suíça: "ch",
  "Bósnia e Herzegovina": "ba",
  Catar: "qa",
  Brasil: "br",
  Marrocos: "ma",
  Escócia: "gb-sct",
  Haiti: "ht",
  "Estados Unidos": "us",
  Austrália: "au",
  Paraguai: "py",
  Turquia: "tr",
  Alemanha: "de",
  "Costa do Marfim": "ci",
  Equador: "ec",
  Curaçao: "cw",
  Holanda: "nl",
  Japão: "jp",
  Suécia: "se",
  Tunísia: "tn",
  Bélgica: "be",
  Egito: "eg",
  Irã: "ir",
  "Nova Zelândia": "nz",
  Espanha: "es",
  Uruguai: "uy",
  "Arábia Saudita": "sa",
  "Cabo Verde": "cv",
  França: "fr",
  Senegal: "sn",
  Iraque: "iq",
  Noruega: "no",
  Argentina: "ar",
  Argélia: "dz",
  Áustria: "at",
  Jordânia: "jo",
  Portugal: "pt",
  "Congo DR": "cd",
  Uzbequistão: "uz",
  Colômbia: "co",
  Inglaterra: "gb-eng",
  Croácia: "hr",
  Gana: "gh",
  Panamá: "pa",
};

// Retorna a URL da bandeira (PNG retina) ou null se o nome não for conhecido.
export function flagUrl(name: string | null | undefined): string | null {
  if (!name) return null;
  const code = TEAM_CODE[name];
  return code ? `https://flagcdn.com/w40/${code}.png` : null;
}
