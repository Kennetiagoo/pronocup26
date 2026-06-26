import type { MatchStage, PaymentStatus, UserRole } from "@prisma/client";

type ReportUser = {
  id: string;
  nombres: string;
  apellidos: string;
  username: string | null;
  role: UserRole;
  paymentStatus: PaymentStatus;
  createdAt: Date;
};

type ReportMatch = {
  id: string;
  matchNumber: number;
  stage: MatchStage;
  groupName: string | null;
  kickoff: Date;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
};

type ReportPrediction = {
  matchId: string;
  userId: string;
  points: number;
  basePoints: number;
  usedX2: boolean;
  x2Returned: boolean;
  Match: ReportMatch;
};

type ReportRule = {
  officialModeEnabled: boolean;
  knockoutMultiplier: number;
};

type StandingTotals = {
  totalPoints: number;
  pointsWithoutBonus: number;
  predictionCount: number;
  perfectHits: number;
  partialLevel2: number;
  partialLevel3: number;
  partialLevel4: number;
  x2UsedCount: number;
};

export type PositionReportInput = {
  generatedAt: Date;
  users: ReportUser[];
  matches: ReportMatch[];
  predictions: ReportPrediction[];
  rule: ReportRule;
  x2UsesGroup: number;
};

type StandingRow = {
  userId: string;
  displayName: string;
  username: string;
  registeredAt: string;
  totalPoints: number;
  pointsWithoutBonus: number;
  predictionCount: number;
  perfectHits: number;
  partialLevel2: number;
  partialLevel3: number;
  partialLevel4: number;
  x2UsedCount: number;
  x2LeftCount: number;
  sortOrder: number;
  position: number;
};

type MatchPoint = {
  matchId: string;
  matchNumber: number;
  label: string;
  position: number;
  totalPoints: number;
};

type UserSeries = {
  userId: string;
  displayName: string;
  username: string;
  latestPosition: number;
  latestPoints: number;
  points: MatchPoint[];
};

type PositionReportData = {
  generatedAt: Date;
  users: StandingRow[];
  matches: ReportMatch[];
  series: UserSeries[];
};

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const CHART_USERS_PER_PAGE = 10;
const TABLE_ROWS_PER_PAGE = 24;

const LINE_COLORS = [
  [0.0, 0.48, 1.0],
  [0.88, 0.2, 0.14],
  [0.08, 0.62, 0.34],
  [0.52, 0.27, 0.82],
  [0.95, 0.58, 0.08],
  [0.0, 0.55, 0.65],
  [0.78, 0.22, 0.46],
  [0.35, 0.42, 0.48],
  [0.16, 0.35, 0.86],
  [0.48, 0.63, 0.13],
];

function ascii(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value: string) {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function shortName(user: ReportUser) {
  const username = user.username?.trim();
  if (username) return `@${username}`;
  const fullName = `${user.nombres} ${user.apellidos}`.trim();
  return fullName || user.id.slice(0, 8);
}

function scoreBucketsForStage(stage: MatchStage, rule: ReportRule) {
  if (!rule.officialModeEnabled) return { max: 7, p2: 5, p3: 4, p4: 3 };
  if (stage === "GROUP") return { max: 10, p2: 7, p3: 6, p4: 5 };
  const multiplier = Math.max(1, rule.knockoutMultiplier);
  return {
    max: 10 * multiplier,
    p2: 7 * multiplier,
    p3: 6 * multiplier,
    p4: 5 * multiplier,
  };
}

function compareStandingRows(a: Omit<StandingRow, "position" | "sortOrder">, b: Omit<StandingRow, "position" | "sortOrder">) {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  if (a.x2UsedCount !== b.x2UsedCount) return a.x2UsedCount - b.x2UsedCount;
  if (b.x2LeftCount !== a.x2LeftCount) return b.x2LeftCount - a.x2LeftCount;
  if (b.perfectHits !== a.perfectHits) return b.perfectHits - a.perfectHits;
  if (b.partialLevel2 !== a.partialLevel2) return b.partialLevel2 - a.partialLevel2;
  if (b.partialLevel3 !== a.partialLevel3) return b.partialLevel3 - a.partialLevel3;
  if (b.partialLevel4 !== a.partialLevel4) return b.partialLevel4 - a.partialLevel4;
  if (b.predictionCount !== a.predictionCount) return b.predictionCount - a.predictionCount;
  if (a.registeredAt !== b.registeredAt) return Date.parse(a.registeredAt) - Date.parse(b.registeredAt);
  return a.username.localeCompare(b.username, "es");
}

function hasSameVisibleRank(a: StandingRow, b: StandingRow) {
  return (
    a.totalPoints === b.totalPoints &&
    a.x2UsedCount === b.x2UsedCount &&
    a.x2LeftCount === b.x2LeftCount &&
    a.perfectHits === b.perfectHits &&
    a.partialLevel2 === b.partialLevel2 &&
    a.partialLevel3 === b.partialLevel3 &&
    a.partialLevel4 === b.partialLevel4 &&
    a.predictionCount === b.predictionCount &&
    a.registeredAt === b.registeredAt
  );
}

function assignSharedPositions(rows: Array<Omit<StandingRow, "position" | "sortOrder">>) {
  const sorted = rows.slice().sort(compareStandingRows);
  return sorted.map((row, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    const position =
      index > 0 && previous && hasSameVisibleRank(previous as StandingRow, row as StandingRow)
        ? (sorted[index - 1] as StandingRow).position
        : index + 1;
    const standingRow = {
      ...row,
      sortOrder: index + 1,
      position,
    } satisfies StandingRow;
    sorted[index] = standingRow;
    return standingRow;
  });
}

function buildStandings(input: {
  users: ReportUser[];
  predictions: ReportPrediction[];
  rule: ReportRule;
  x2UsesGroup: number;
}) {
  const totalsByUser = new Map<string, StandingTotals>();

  for (const prediction of input.predictions) {
    const current = totalsByUser.get(prediction.userId) ?? {
      totalPoints: 0,
      pointsWithoutBonus: 0,
      predictionCount: 0,
      perfectHits: 0,
      partialLevel2: 0,
      partialLevel3: 0,
      partialLevel4: 0,
      x2UsedCount: 0,
    };

    current.totalPoints += prediction.points ?? 0;
    current.pointsWithoutBonus += prediction.basePoints ?? 0;
    current.predictionCount += 1;

    const buckets = scoreBucketsForStage(prediction.Match.stage, input.rule);
    const basePoints = prediction.basePoints ?? 0;
    if (basePoints >= buckets.max) current.perfectHits += 1;
    else if (basePoints === buckets.p2) current.partialLevel2 += 1;
    else if (basePoints === buckets.p3) current.partialLevel3 += 1;
    else if (basePoints === buckets.p4) current.partialLevel4 += 1;

    if (
      prediction.usedX2 &&
      !prediction.x2Returned &&
      basePoints > 0 &&
      prediction.Match.stage === "GROUP"
    ) {
      current.x2UsedCount += 1;
    }

    totalsByUser.set(prediction.userId, current);
  }

  const rows = input.users.map((user) => {
    const totals = totalsByUser.get(user.id);
    const username = user.username?.trim() ?? "";
    return {
      userId: user.id,
      displayName: shortName(user),
      username,
      registeredAt: user.createdAt.toISOString(),
      totalPoints: totals?.totalPoints ?? 0,
      pointsWithoutBonus: totals?.pointsWithoutBonus ?? 0,
      predictionCount: totals?.predictionCount ?? 0,
      perfectHits: totals?.perfectHits ?? 0,
      partialLevel2: totals?.partialLevel2 ?? 0,
      partialLevel3: totals?.partialLevel3 ?? 0,
      partialLevel4: totals?.partialLevel4 ?? 0,
      x2UsedCount: totals?.x2UsedCount ?? 0,
      x2LeftCount: Math.max(0, input.x2UsesGroup - (totals?.x2UsedCount ?? 0)),
    };
  });

  return assignSharedPositions(rows);
}

function buildReportData(input: PositionReportInput): PositionReportData {
  const matches = input.matches
    .filter((match) => match.homeScore !== null && match.awayScore !== null)
    .slice()
    .sort((a, b) => {
      const kickoffDiff = a.kickoff.getTime() - b.kickoff.getTime();
      if (kickoffDiff !== 0) return kickoffDiff;
      return a.matchNumber - b.matchNumber;
    });
  const matchIds = new Set(matches.map((match) => match.id));
  const relevantPredictions = input.predictions.filter((prediction) => matchIds.has(prediction.matchId));
  const users = input.users
    .filter((user) => user.role === "ADMIN" || user.paymentStatus === "APROBADO")
    .filter((user) => shortName(user).length > 0);

  if (matches.length === 0) {
    const initialUsers = buildStandings({
      users,
      predictions: [],
      rule: input.rule,
      x2UsesGroup: input.x2UsesGroup,
    });
    return {
      generatedAt: input.generatedAt,
      users: initialUsers,
      matches,
      series: initialUsers.map((row) => ({
        userId: row.userId,
        displayName: row.displayName,
        username: row.username,
        latestPosition: row.position,
        latestPoints: row.totalPoints,
        points: [],
      })),
    };
  }

  const historyByUser = new Map<string, MatchPoint[]>();
  let latestRows: StandingRow[] = [];

  matches.forEach((match, index) => {
    const includedMatchIds = new Set(matches.slice(0, index + 1).map((item) => item.id));
    const standings = buildStandings({
      users,
      predictions: relevantPredictions.filter((prediction) => includedMatchIds.has(prediction.matchId)),
      rule: input.rule,
      x2UsesGroup: input.x2UsesGroup,
    });
    latestRows = standings;

    for (const row of standings) {
      const history = historyByUser.get(row.userId) ?? [];
      history.push({
        matchId: match.id,
        matchNumber: match.matchNumber,
        label: `P${match.matchNumber}`,
        position: row.position,
        totalPoints: row.totalPoints,
      });
      historyByUser.set(row.userId, history);
    }
  });

  return {
    generatedAt: input.generatedAt,
    users: latestRows,
    matches,
    series: latestRows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      username: row.username,
      latestPosition: row.position,
      latestPoints: row.totalPoints,
      points: historyByUser.get(row.userId) ?? [],
    })),
  };
}

class PdfDocument {
  private readonly pages: string[] = [];

  addPage(draw: (page: PdfPage) => void) {
    const page = new PdfPage();
    draw(page);
    this.pages.push(page.content());
  }

  toBuffer() {
    const objects: string[] = [];
    const addObject = (content: string) => {
      objects.push(content);
      return objects.length;
    };

    const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const pageObjectIds: number[] = [];
    const contentObjectIds: number[] = [];

    for (const page of this.pages) {
      const contentId = addObject(`<< /Length ${Buffer.byteLength(page, "ascii")} >>\nstream\n${page}\nendstream`);
      contentObjectIds.push(contentId);
      pageObjectIds.push(0);
    }

    const pagesId = objects.length + this.pages.length + 1;
    for (let index = 0; index < this.pages.length; index += 1) {
      const pageId = addObject(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`,
      );
      pageObjectIds[index] = pageId;
    }

    const pagesObjectId = addObject(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`);
    const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((content, index) => {
      offsets.push(Buffer.byteLength(pdf, "ascii"));
      pdf += `${index + 1} 0 obj\n${content}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, "ascii");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, "ascii");
  }
}

class PdfPage {
  private readonly commands: string[] = [];

  content() {
    return this.commands.join("\n");
  }

  text(value: string, x: number, y: number, size = 10, bold = false) {
    this.commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(value)}) Tj ET`);
  }

  line(x1: number, y1: number, x2: number, y2: number, color = [0, 0, 0], width = 1) {
    this.commands.push(`${color.map((item) => item.toFixed(3)).join(" ")} RG ${width.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  rect(x: number, y: number, width: number, height: number, color = [0, 0, 0], fill = false) {
    this.commands.push(`${color.map((item) => item.toFixed(3)).join(" ")} ${fill ? "rg" : "RG"} ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill ? "f" : "S"}`);
  }

  polyline(points: Array<{ x: number; y: number }>, color: number[], width = 1) {
    if (points.length < 2) return;
    const [first, ...rest] = points;
    this.commands.push(`${color.map((item) => item.toFixed(3)).join(" ")} RG ${width.toFixed(2)} w ${first.x.toFixed(2)} ${first.y.toFixed(2)} m ${rest.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)} l`).join(" ")} S`);
  }
}

function chartX(index: number, total: number, left: number, width: number) {
  if (total <= 1) return left + width / 2;
  return left + (index / (total - 1)) * width;
}

function chartY(position: number, maxPosition: number, bottom: number, height: number) {
  if (maxPosition <= 1) return bottom + height / 2;
  return bottom + height - ((position - 1) / (maxPosition - 1)) * height;
}

function drawHeader(page: PdfPage, title: string, generatedAt: Date) {
  page.text(title, 44, 558, 18, true);
  page.text(`Generado: ${formatDateTime(generatedAt)} GMT-5`, 44, 538, 9);
  page.line(44, 525, 798, 525, [0.82, 0.84, 0.86], 0.8);
}

function drawNoData(page: PdfPage) {
  page.text("Todavia no hay partidos finalizados con marcador.", 64, 460, 14, true);
  page.text("Cuando se registren resultados finales, este informe mostrara la evolucion partido a partido.", 64, 440, 10);
}

function drawChartPage(page: PdfPage, data: PositionReportData, chunk: UserSeries[], pageNumber: number, totalPages: number) {
  drawHeader(page, `Evolucion de posiciones - grafico ${pageNumber} de ${totalPages}`, data.generatedAt);

  const chartLeft = 64;
  const chartBottom = 92;
  const chartWidth = 590;
  const chartHeight = 390;
  const maxPosition = Math.max(1, data.users.length);

  page.text("Posicion", 64, 498, 9, true);
  page.text("Partido", 594, 70, 9, true);
  page.rect(chartLeft, chartBottom, chartWidth, chartHeight, [0.55, 0.59, 0.64]);

  const yTicks = Array.from(new Set([1, Math.ceil(maxPosition * 0.25), Math.ceil(maxPosition * 0.5), Math.ceil(maxPosition * 0.75), maxPosition])).filter((tick) => tick >= 1);
  for (const tick of yTicks) {
    const y = chartY(tick, maxPosition, chartBottom, chartHeight);
    page.line(chartLeft, y, chartLeft + chartWidth, y, [0.9, 0.91, 0.93], 0.5);
    page.text(`#${tick}`, 38, y - 3, 8);
  }

  const xStep = data.matches.length <= 16 ? 1 : Math.ceil(data.matches.length / 12);
  data.matches.forEach((match, index) => {
    if (index % xStep !== 0 && index !== data.matches.length - 1) return;
    const x = chartX(index, data.matches.length, chartLeft, chartWidth);
    page.line(x, chartBottom, x, chartBottom + chartHeight, [0.92, 0.93, 0.95], 0.5);
    page.text(`P${match.matchNumber}`, x - 8, chartBottom - 18, 7);
  });

  chunk.forEach((series, index) => {
    const color = LINE_COLORS[index % LINE_COLORS.length];
    const points = series.points.map((point, pointIndex) => ({
      x: chartX(pointIndex, data.matches.length, chartLeft, chartWidth),
      y: chartY(point.position, maxPosition, chartBottom, chartHeight),
    }));
    page.polyline(points, color, 1.4);
    for (const point of points) {
      page.rect(point.x - 1.6, point.y - 1.6, 3.2, 3.2, color, true);
    }
  });

  const legendLeft = 680;
  page.text("Usuarios", legendLeft, 498, 11, true);
  chunk.forEach((series, index) => {
    const y = 476 - index * 28;
    const color = LINE_COLORS[index % LINE_COLORS.length];
    page.rect(legendLeft, y + 3, 12, 4, color, true);
    page.text(`${series.displayName}`, legendLeft + 18, y, 8, true);
    page.text(`#${series.latestPosition} - ${series.latestPoints} pts`, legendLeft + 18, y - 11, 8);
  });
}

function drawTablePage(page: PdfPage, data: PositionReportData, rows: StandingRow[], pageNumber: number, totalPages: number) {
  drawHeader(page, `Ranking actual - pagina ${pageNumber} de ${totalPages}`, data.generatedAt);

  const startY = 494;
  page.rect(44, startY - 8, 754, 22, [0.94, 0.95, 0.96], true);
  page.text("Pos", 56, startY, 9, true);
  page.text("Usuario", 102, startY, 9, true);
  page.text("Puntos", 438, startY, 9, true);
  page.text("Base", 500, startY, 9, true);
  page.text("Picks", 560, startY, 9, true);
  page.text("X2 usados", 620, startY, 9, true);
  page.text("Plenos", 704, startY, 9, true);

  rows.forEach((row, index) => {
    const y = startY - 28 - index * 18;
    if (index % 2 === 0) page.rect(44, y - 5, 754, 16, [0.98, 0.985, 0.99], true);
    page.text(`#${row.position}`, 56, y, 8);
    page.text(row.displayName, 102, y, 8);
    page.text(String(row.totalPoints), 438, y, 8);
    page.text(String(row.pointsWithoutBonus), 500, y, 8);
    page.text(String(row.predictionCount), 560, y, 8);
    page.text(String(row.x2UsedCount), 620, y, 8);
    page.text(String(row.perfectHits), 704, y, 8);
  });
}

export function generatePositionEvolutionPdf(input: PositionReportInput) {
  const data = buildReportData(input);
  const pdf = new PdfDocument();

  pdf.addPage((page) => {
    drawHeader(page, "Informe de evolucion de posiciones", data.generatedAt);
    page.text("Tabla de posiciones de usuarios por partido", 64, 470, 22, true);
    page.text(`Usuarios incluidos: ${data.users.length}`, 64, 438, 12);
    page.text(`Partidos finalizados: ${data.matches.length}`, 64, 420, 12);
    page.text("Criterio: posiciones acumuladas despues de cada partido finalizado, usando los mismos desempates del ranking.", 64, 394, 10);
    if (data.matches.length === 0) drawNoData(page);
  });

  if (data.matches.length > 0) {
    const chunks: UserSeries[][] = [];
    for (let index = 0; index < data.series.length; index += CHART_USERS_PER_PAGE) {
      chunks.push(data.series.slice(index, index + CHART_USERS_PER_PAGE));
    }
    chunks.forEach((chunk, index) => {
      pdf.addPage((page) => drawChartPage(page, data, chunk, index + 1, chunks.length));
    });
  }

  const tablePages: StandingRow[][] = [];
  for (let index = 0; index < data.users.length; index += TABLE_ROWS_PER_PAGE) {
    tablePages.push(data.users.slice(index, index + TABLE_ROWS_PER_PAGE));
  }
  tablePages.forEach((rows, index) => {
    pdf.addPage((page) => drawTablePage(page, data, rows, index + 1, tablePages.length));
  });

  return pdf.toBuffer();
}
