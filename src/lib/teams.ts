import countries from "i18n-iso-countries";

export type TeamPresentation = {
  nameEs: string;
  code2: string | null;
  flagUrl: string | null;
};

const TEAM_NAME_TRANSLATIONS: Record<string, string> = {
  Argentina: "Argentina",
  Australia: "Australia",
  Belgium: "Bélgica",
  Bolivia: "Bolivia",
  "Bosnia and Herzegovina": "Bosnia y Herzegovina",
  Brazil: "Brasil",
  Cameroon: "Camerún",
  Canada: "Canadá",
  "Cape Verde": "Cabo Verde",
  Chile: "Chile",
  Colombia: "Colombia",
  "Costa Rica": "Costa Rica",
  Croatia: "Croacia",
  Curacao: "Curazao",
  "Czech Republic": "República Checa",
  Denmark: "Dinamarca",
  Ecuador: "Ecuador",
  Egypt: "Egipto",
  England: "Inglaterra",
  France: "Francia",
  Germany: "Alemania",
  Ghana: "Ghana",
  Haiti: "Haití",
  Honduras: "Honduras",
  "Ivory Coast": "Costa de Marfil",
  Japan: "Japón",
  Mexico: "México",
  Morocco: "Marruecos",
  Netherlands: "Países Bajos",
  Nigeria: "Nigeria",
  Panama: "Panamá",
  Paraguay: "Paraguay",
  Peru: "Perú",
  Poland: "Polonia",
  Portugal: "Portugal",
  "Saudi Arabia": "Arabia Saudita",
  Scotland: "Escocia",
  Senegal: "Senegal",
  Serbia: "Serbia",
  "South Africa": "Sudáfrica",
  "South Korea": "Corea del Sur",
  Spain: "España",
  Sweden: "Suecia",
  Switzerland: "Suiza",
  Tunisia: "Túnez",
  Turkey: "Turquía",
  Uruguay: "Uruguay",
  "United States": "Estados Unidos",
  Venezuela: "Venezuela",
  Wales: "Gales",
};

function normalizeCountryCode(code: string | null) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  if (/^[A-Z]{3}$/.test(normalized)) {
    const mapped = countries.alpha3ToAlpha2(normalized);
    if (mapped) return mapped.toUpperCase();
    const fallbackMap: Record<string, string> = {
      XKX: "XK",
      KOS: "XK",
    };
    return fallbackMap[normalized] ?? null;
  }
  return null;
}

function splitTeamCodeFromName(teamName: string) {
  const match = teamName.match(/^([A-Z]{2,3})\s+(.+)$/);
  if (!match) {
    return { embeddedCode: null as string | null, cleanName: teamName.trim() };
  }
  return {
    embeddedCode: match[1],
    cleanName: match[2].trim(),
  };
}

function getSpecialFlagUrl(rawCode: string | null, teamName: string) {
  const code = rawCode?.toUpperCase() ?? "";
  const normalizedName = teamName.trim().toLowerCase();
  if (code === "ENG" || normalizedName === "england" || normalizedName === "inglaterra") {
    return "/flags/england.svg";
  }
  if (code === "SCO" || normalizedName === "scotland" || normalizedName === "escocia") {
    return "/flags/scotland.svg";
  }
  return null;
}

export function getTeamPresentation(teamName: string, teamCode: string | null): TeamPresentation {
  const { embeddedCode, cleanName } = splitTeamCodeFromName(teamName);
  const rawCode = teamCode ?? embeddedCode;
  const code2 = normalizeCountryCode(rawCode);
  const nameEs = TEAM_NAME_TRANSLATIONS[cleanName] ?? cleanName;
  const specialFlagUrl = getSpecialFlagUrl(rawCode, cleanName);
  return {
    nameEs,
    code2,
    flagUrl:
      specialFlagUrl ??
      (code2 ? `https://flagcdn.com/w40/${code2.toLowerCase()}.png` : null),
  };
}
