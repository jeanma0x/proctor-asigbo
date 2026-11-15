import PDFDocument from "pdfkit";
import { LOGO_PNG_BASE64 } from "@/lib/report-assets";
import { METHOD_INFO, STRIKE_PENALTY, type RankMethod, type RankResult } from "@/lib/ranking";
import { EVENT_LABEL } from "@/lib/labels";

/* ───────────── Marca ───────────── */
const C = {
  blue: "#1e3a8a", blueDark: "#172e6e", cyan: "#06b6d4", green: "#84cc16", orange: "#f97316",
  ink: "#0f172a", muted: "#475569", faint: "#94a3b8", line: "#e2e8f0", bg: "#f8fafc",
  ok: "#047857", okBg: "#d1fae5", bad: "#b91c1c", badBg: "#fee2e2", warn: "#b45309", warnBg: "#fef3c7",
};
const PAGE = { w: 595.28, h: 841.89, m: 48 };
const CONTENT_W = PAGE.w - PAGE.m * 2;
const HEADER_H = 70;
const FOOTER_H = 44;
const BOTTOM = PAGE.h - FOOTER_H - 14;
const logoBuf = Buffer.from(LOGO_PNG_BASE64, "base64");

const DECISION_ES = { SELECTED: "Seleccionado", WAITLIST: "Lista de espera", NOT_SELECTED: "No seleccionado" } as const;
const STATUS_ES = { NOT_STARTED: "Sin iniciar", IN_PROGRESS: "En examen", SUBMITTED: "Entregado", TERMINATED: "Cerrado por infracciones" } as const;

/** Las fuentes estándar de PDF solo cubren Latin-1 (acentos y ñ sí): lo demás se sustituye para no corromper el texto. */
export const safe = (s: string | null | undefined) =>
  (s ?? "").normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\u0009\u000A -ÿ–—•…]/g, "?");

export const fmtDT = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("es-GT", { dateStyle: "long", timeStyle: "short", timeZone: "America/Guatemala" }).format(d) : "-";
export const fmtD = (d: Date) => new Intl.DateTimeFormat("es-GT", { dateStyle: "long", timeZone: "America/Guatemala" }).format(d);

type Doc = InstanceType<typeof PDFDocument>;

/** Recorta el texto con «...» para que quepa en el ancho dado con la fuente actual (pdfkit no recorta solo). */
function fit(doc: Doc, text: string, width: number) {
  const t = safe(text);
  if (doc.widthOfString(t) <= width) return t;
  let lo = 0, hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.widthOfString(t.slice(0, mid) + "...") <= width) lo = mid; else hi = mid - 1;
  }
  return t.slice(0, lo).trimEnd() + "...";
}

/* ───────────── Base: documento con membrete ───────────── */
function createDoc(title: string, subtitle: string, author: string) {
  const doc = new PDFDocument({
    size: "A4", margins: { top: HEADER_H + 24, bottom: FOOTER_H + 20, left: PAGE.m, right: PAGE.m },
    bufferPages: true, info: { Title: title, Author: author, Subject: subtitle, Creator: "ASIGBO Proctoring" },
  });

  const logo = (doc as unknown as { openImage(src: Buffer): never }).openImage(logoBuf); // se incrusta una sola vez y se reutiliza en cada página
  const letterhead = () => {
    const seg = CONTENT_W + PAGE.m * 2;
    [C.blue, C.cyan, C.green, C.orange].forEach((col, i) => doc.rect((seg / 4) * i, 0, seg / 4, 6).fill(col));
    doc.image(logo, PAGE.m, 20, { height: 36 });
    doc.fillColor(C.blue).font("Helvetica-Bold").fontSize(10).text(safe(title).toUpperCase(), PAGE.m, 24, { width: CONTENT_W, align: "right", characterSpacing: 0.8, lineBreak: false });
    doc.fillColor(C.muted).font("Helvetica").fontSize(9).text(safe(subtitle), PAGE.m, 40, { width: CONTENT_W, align: "right", lineBreak: false });
    doc.moveTo(PAGE.m, HEADER_H).lineTo(PAGE.w - PAGE.m, HEADER_H).lineWidth(0.8).strokeColor(C.line).stroke();
    doc.x = PAGE.m;
    doc.y = HEADER_H + 24;
  };
  letterhead();
  doc.on("pageAdded", letterhead);
  return doc;
}

/** Pie con paginación; se dibuja al final sobre todas las páginas. */
function finish(doc: Doc, generatedBy: string): Promise<Buffer> {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // el pie está dentro del margen inferior: sin esto pdfkit añadiría páginas en blanco
    const y = PAGE.h - FOOTER_H;
    doc.moveTo(PAGE.m, y).lineTo(PAGE.w - PAGE.m, y).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.fillColor(C.faint).font("Helvetica").fontSize(8)
      .text(safe(`Asociación de Becados Isabel Gutiérrez de Bosch (ASIGBO)  ·  Documento confidencial de uso interno`), PAGE.m, y + 9, { width: CONTENT_W - 80, lineBreak: false })
      .text(safe(`Generado por ${generatedBy} el ${fmtDT(new Date())}`), PAGE.m, y + 21, { width: CONTENT_W - 80, lineBreak: false });
    doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(9)
      .text(`Página ${i + 1} de ${range.count}`, PAGE.w - PAGE.m - 90, y + 14, { width: 90, align: "right", lineBreak: false });
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

/* ───────────── Utilidades de dibujo ───────────── */
const ensure = (doc: Doc, h: number) => { if (doc.y + h > BOTTOM) doc.addPage(); };

function h2(doc: Doc, text: string) {
  ensure(doc, 40);
  doc.moveDown(0.6);
  const y = doc.y;
  doc.rect(PAGE.m, y + 1, 4, 14).fill(C.green);
  doc.fillColor(C.blue).font("Helvetica-Bold").fontSize(13).text(safe(text), PAGE.m + 12, y, { width: CONTENT_W - 12 });
  doc.moveDown(0.5);
  doc.x = PAGE.m;
}

function pill(doc: Doc, text: string, x: number, y: number, fg: string, bg: string) {
  doc.font("Helvetica-Bold").fontSize(8);
  const w = doc.widthOfString(safe(text)) + 14;
  doc.roundedRect(x, y, w, 15, 7.5).fill(bg);
  doc.fillColor(fg).text(safe(text), x + 7, y + 4, { lineBreak: false });
  return w;
}

function kpis(doc: Doc, items: [string, string][]) {
  ensure(doc, 64);
  const gap = 10;
  const w = (CONTENT_W - gap * (items.length - 1)) / items.length;
  const y = doc.y;
  items.forEach(([label, value], i) => {
    const x = PAGE.m + i * (w + gap);
    doc.roundedRect(x, y, w, 52, 8).fill(C.bg);
    doc.rect(x, y + 10, 3, 32).fill(C.blue);
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(17).text(safe(value), x + 12, y + 10, { width: w - 16, lineBreak: false });
    doc.fillColor(C.muted).font("Helvetica").fontSize(8).text(safe(label), x + 12, y + 33, { width: w - 16, lineBreak: false });
  });
  doc.y = y + 52 + 14;
  doc.x = PAGE.m;
}

function bar(doc: Doc, x: number, y: number, w: number, pct: number, color = C.blue) {
  doc.roundedRect(x, y, w, 6, 3).fill(C.line);
  if (pct > 0) doc.roundedRect(x, y, Math.max(6, (w * Math.min(100, pct)) / 100), 6, 3).fill(color);
}

/** Tabla simple con encabezado repetido en cada página. */
function table(doc: Doc, cols: { label: string; w: number; align?: "left" | "right" | "center" }[], rows: (string | { text: string; color?: string; bold?: boolean })[][]) {
  const total = cols.reduce((a, c) => a + c.w, 0);
  const scale = CONTENT_W / total;
  const widths = cols.map((c) => c.w * scale);
  const header = () => {
    const y = doc.y;
    doc.rect(PAGE.m, y, CONTENT_W, 20).fill(C.blue);
    let x = PAGE.m;
    cols.forEach((c, i) => {
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5);
      doc.text(fit(doc, c.label.toUpperCase(), widths[i] - 8), x + 4, y + 6, { width: widths[i] - 8, align: c.align ?? "left", lineBreak: false });
      x += widths[i];
    });
    doc.y = y + 20;
  };
  ensure(doc, 60);
  header();
  rows.forEach((row, ri) => {
    if (doc.y + 24 > BOTTOM) { doc.addPage(); header(); }
    const y = doc.y;
    if (ri % 2 === 0) doc.rect(PAGE.m, y, CONTENT_W, 24).fill(C.bg);
    let x = PAGE.m;
    row.forEach((cell, i) => {
      const t = typeof cell === "string" ? { text: cell } : cell;
      doc.fillColor(t.color ?? C.ink).font(t.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      doc.text(fit(doc, t.text, widths[i] - 12), x + 6, y + 8, { width: widths[i] - 12, align: cols[i].align ?? "left", lineBreak: false });
      x += widths[i];
    });
    doc.y = y + 24;
  });
  doc.moveTo(PAGE.m, doc.y).lineTo(PAGE.w - PAGE.m, doc.y).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.y += 10;
  doc.x = PAGE.m;
}

function note(doc: Doc, text: string) {
  doc.font("Helvetica").fontSize(8.5);
  const h = doc.heightOfString(safe(text), { width: CONTENT_W - 24 }) + 16;
  ensure(doc, h + 6);
  const y = doc.y;
  doc.roundedRect(PAGE.m, y, CONTENT_W, h, 6).fill(C.warnBg);
  doc.fillColor(C.warn).text(safe(text), PAGE.m + 12, y + 8, { width: CONTENT_W - 24 });
  doc.y = y + h + 10;
  doc.x = PAGE.m;
}

/* ───────────── Informe individual ───────────── */
export type CandidateReportData = {
  candidate: { fullName: string; email: string };
  exam: { title: string; durationMinutes: number; convocatoria: { name: string; year: number } | null };
  status: keyof typeof STATUS_ES;
  score: number | null;
  maxScore: number;
  flagCount: number;
  startedAt: Date | null;
  submittedAt: Date | null;
  decision: keyof typeof DECISION_ES | null;
  position: { rank: number; of: number; percentile: number; index: number; method: RankMethod } | null;
  questions: {
    number: number; text: string; type: "MULTIPLE_CHOICE" | "TEXT"; points: number; earned: number; answered: boolean; correct: boolean | null;
    textResponse: string | null; options: { text: string; isCorrect: boolean; selected: boolean }[];
  }[];
  hasOpenQuestions: boolean;
  auditLogs: { type: string; severity: string; details: string | null; createdAt: Date }[];
};

export async function buildCandidateReport(d: CandidateReportData, generatedBy: string): Promise<Buffer> {
  const doc = createDoc("Informe individual de resultados", d.exam.convocatoria?.name ?? d.exam.title, generatedBy);

  doc.fillColor(C.blue).font("Helvetica-Bold").fontSize(9).text(safe(`${d.exam.convocatoria?.name ?? "Convocatoria"}  ·  ${d.exam.title}`).toUpperCase(), { characterSpacing: 0.8 });
  doc.moveDown(0.3).fillColor(C.ink).font("Helvetica-Bold").fontSize(24).text(safe(d.candidate.fullName));
  doc.fillColor(C.muted).font("Helvetica").fontSize(10.5).text(safe(d.candidate.email));
  doc.moveDown(0.8);

  const pct = d.score != null && d.maxScore ? Math.round((d.score / d.maxScore) * 100) : null;
  const mins = d.startedAt && d.submittedAt ? Math.max(1, Math.round((d.submittedAt.getTime() - d.startedAt.getTime()) / 60000)) : null;
  kpis(doc, [
    ["Puntaje", d.score == null ? "-" : `${d.score} / ${d.maxScore}`],
    ["Aciertos", pct == null ? "-" : `${pct}%`],
    ["Infracciones", String(d.flagCount)],
    ["Tiempo usado", mins ? `${mins} / ${d.exam.durationMinutes} min` : "-"],
  ]);
  if (pct != null) { bar(doc, PAGE.m, doc.y - 4, CONTENT_W, pct, pct >= 60 ? C.blue : C.orange); doc.y += 14; }

  // Ficha
  const fy = doc.y;
  const rows: [string, string][] = [
    ["Estado", STATUS_ES[d.status]],
    ["Inicio del examen", fmtDT(d.startedAt)],
    ["Entrega", fmtDT(d.submittedAt)],
    ...(d.position ? [["Posición en el ranking", `${d.position.rank} de ${d.position.of}  ·  índice ${d.position.index.toFixed(1)}  ·  percentil ${d.position.percentile}`] as [string, string]] : []),
    ...(d.decision ? [["Decisión de la Junta", DECISION_ES[d.decision]] as [string, string]] : []),
  ];
  rows.forEach(([k, v], i) => {
    const y = fy + i * 20;
    doc.fillColor(C.muted).font("Helvetica").fontSize(9).text(safe(k), PAGE.m, y, { width: 150, lineBreak: false });
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(9.5).text(safe(v), PAGE.m + 160, y, { width: CONTENT_W - 160, lineBreak: false });
  });
  doc.y = fy + rows.length * 20 + 6;
  if (d.hasOpenQuestions) note(doc, "Este examen incluye preguntas abiertas: el puntaje automático solo suma las de opción múltiple. Las respuestas abiertas se muestran para su revisión manual.");

  h2(doc, "Respuestas por pregunta");
  for (const q of d.questions) {
    doc.font("Helvetica-Bold").fontSize(10.5);
    const textH = doc.heightOfString(safe(q.text), { width: CONTENT_W - 120 });
    const optsH = q.type === "MULTIPLE_CHOICE" ? q.options.length * 22 : Math.min(120, doc.font("Helvetica").fontSize(9.5).heightOfString(safe(q.textResponse || "Sin responder"), { width: CONTENT_W - 28 }) + 20);
    ensure(doc, Math.min(textH + optsH + 40, 300));
    const y0 = doc.y;
    doc.roundedRect(PAGE.m, y0, 24, 18, 5).fill(C.blue);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9.5).text(String(q.number), PAGE.m, y0 + 5, { width: 24, align: "center", lineBreak: false });
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(10.5).text(safe(q.text), PAGE.m + 34, y0 + 2, { width: CONTENT_W - 130 });
    const tag =
      q.type === "TEXT" ? { t: "Abierta", fg: C.muted, bg: C.line }
      : !q.answered ? { t: "Sin responder", fg: C.muted, bg: C.line }
      : q.correct ? { t: `Correcta +${q.earned}`, fg: C.ok, bg: C.okBg }
      : { t: "Incorrecta", fg: C.bad, bg: C.badBg };
    doc.font("Helvetica-Bold").fontSize(8);
    const tw = doc.widthOfString(tag.t) + 14;
    pill(doc, tag.t, PAGE.w - PAGE.m - tw, y0 + 1, tag.fg, tag.bg);
    doc.y = Math.max(doc.y, y0 + 22) + 4;

    if (q.type === "MULTIPLE_CHOICE") {
      for (const o of q.options) {
        const y = doc.y;
        const border = o.selected && o.isCorrect ? C.ok : o.selected ? C.bad : o.isCorrect ? C.ok : C.line;
        const fill = o.selected && o.isCorrect ? C.okBg : o.selected ? C.badBg : "#ffffff";
        doc.roundedRect(PAGE.m + 34, y, CONTENT_W - 34, 19, 5).lineWidth(o.selected || o.isCorrect ? 1 : 0.6).fillAndStroke(fill, border);
        doc.fillColor(C.ink).font("Helvetica").fontSize(9.5);
        doc.text(fit(doc, o.text, CONTENT_W - 190), PAGE.m + 44, y + 5, { width: CONTENT_W - 190, lineBreak: false });
        const marks = [o.selected ? "Su respuesta" : "", o.isCorrect ? "Correcta" : ""].filter(Boolean).join("   ");
        doc.fillColor(o.isCorrect ? C.ok : C.bad).font("Helvetica-Bold").fontSize(8).text(marks, PAGE.m + 34, y + 6, { width: CONTENT_W - 44, align: "right", lineBreak: false });
        doc.y = y + 22;
      }
    } else {
      const t = safe(q.textResponse?.trim() || "Sin responder");
      doc.font("Helvetica").fontSize(9.5);
      const h = Math.min(160, doc.heightOfString(t, { width: CONTENT_W - 60 }) + 16);
      const y = doc.y;
      doc.roundedRect(PAGE.m + 34, y, CONTENT_W - 34, h, 6).fill(C.bg);
      doc.fillColor(q.textResponse ? C.ink : C.faint).text(t, PAGE.m + 46, y + 8, { width: CONTENT_W - 60, height: h - 12, ellipsis: true });
      doc.y = y + h + 4;
    }
    doc.y += 8;
    doc.x = PAGE.m;
  }

  h2(doc, "Bitácora de eventos de seguridad");
  if (d.auditLogs.length === 0) {
    doc.fillColor(C.muted).font("Helvetica").fontSize(9.5).text("Sin eventos registrados.");
  } else {
    table(doc, [{ label: "Fecha y hora", w: 150 }, { label: "Evento", w: 190 }, { label: "Detalle", w: 150 }],
      d.auditLogs.map((l) => [fmtDT(l.createdAt), { text: EVENT_LABEL[l.type] ?? l.type, color: l.severity === "CRITICAL" ? C.bad : l.severity === "WARNING" ? C.warn : C.ink, bold: l.severity !== "INFO" }, l.details ?? ""]));
  }
  return finish(doc, generatedBy);
}

/* ───────────── Informe grupal del examen ───────────── */
export type ExamReportData = {
  exam: { title: string; durationMinutes: number; convocatoria: { name: string; year: number } | null };
  method: RankMethod;
  result: RankResult;
  enabled: number;
  started: number;
};

export async function buildExamReport(d: ExamReportData, generatedBy: string): Promise<Buffer> {
  const r = d.result;
  const doc = createDoc("Informe de resultados del examen", d.exam.convocatoria?.name ?? d.exam.title, generatedBy);

  doc.fillColor(C.blue).font("Helvetica-Bold").fontSize(9).text(safe(d.exam.convocatoria?.name ?? "Convocatoria").toUpperCase(), { characterSpacing: 0.8 });
  doc.moveDown(0.3).fillColor(C.ink).font("Helvetica-Bold").fontSize(24).text(safe(d.exam.title));
  doc.fillColor(C.muted).font("Helvetica").fontSize(10.5).text(safe(`Duración: ${d.exam.durationMinutes} minutos  ·  Método de ranking: ${METHOD_INFO[d.method].label}`));
  doc.moveDown(0.8);

  kpis(doc, [
    ["Habilitados", String(d.enabled)],
    ["Iniciaron", String(d.started)],
    ["Entregaron", String(r.stats.n)],
    ["Cerrados", String(r.excluded.length)],
  ]);
  kpis(doc, [
    ["Promedio del índice", r.stats.mean.toFixed(1)],
    ["Mediana", r.stats.median.toFixed(1)],
    ["Mejor puntaje", r.stats.n ? r.stats.max.toFixed(1) : "-"],
    ["Menor puntaje", r.stats.n ? r.stats.min.toFixed(1) : "-"],
  ]);

  // Distribución
  h2(doc, "Distribución de puntajes");
  const buckets = ["0-19", "20-39", "40-59", "60-79", "80-100"].map((label) => ({ label, n: 0 }));
  r.rows.forEach((x) => { buckets[Math.min(4, Math.floor(x.index / 20))].n++; });
  const maxN = Math.max(1, ...buckets.map((b) => b.n));
  ensure(doc, 120);
  const cy = doc.y, ch = 80, bw = 56, gap = (CONTENT_W - bw * 5) / 4;
  buckets.forEach((b, i) => {
    const x = PAGE.m + i * (bw + gap);
    const h = (b.n / maxN) * ch;
    doc.roundedRect(x, cy + ch - h, bw, Math.max(h, 2), 3).fill(i >= 3 ? C.blue : i === 2 ? C.cyan : C.orange);
    doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(10).text(String(b.n), x, cy + ch - h - 14, { width: bw, align: "center", lineBreak: false });
    doc.fillColor(C.muted).font("Helvetica").fontSize(8.5).text(`${b.label}%`, x, cy + ch + 5, { width: bw, align: "center", lineBreak: false });
  });
  doc.y = cy + ch + 28;
  doc.x = PAGE.m;

  // Ranking
  h2(doc, "Clasificación de candidatos");
  if (r.rows.length === 0) doc.fillColor(C.muted).font("Helvetica").fontSize(9.5).text("No hay candidatos clasificados.");
  else
    table(
      doc,
      [{ label: "#", w: 28, align: "center" }, { label: "Candidato", w: 190 }, { label: "Índice", w: 52, align: "right" }, { label: "Bruto", w: 52, align: "right" }, { label: "Infr.", w: 36, align: "center" }, { label: "Tiempo", w: 52, align: "right" }, { label: "Decisión", w: 92 }],
      r.rows.map((x) => [
        { text: `${x.position}${x.tied ? "*" : ""}`, bold: true },
        { text: x.name, bold: x.position <= 3 },
        { text: x.index.toFixed(1), bold: true },
        `${x.rawPct.toFixed(0)}%`,
        { text: String(x.flagCount), color: x.flagCount > 0 ? C.bad : C.ink },
        x.minutes ? `${x.minutes} min` : "-",
        x.decision ? { text: DECISION_ES[x.decision], color: x.decision === "SELECTED" ? C.ok : C.ink, bold: x.decision === "SELECTED" } : { text: "-", color: C.faint },
      ]),
    );
  if (r.rows.some((x) => x.tied)) doc.fillColor(C.muted).font("Helvetica").fontSize(8).text("* Empate en el índice: se desempató por menos infracciones, menor tiempo utilizado y hora de entrega.");

  if (r.excluded.length) {
    h2(doc, "Exámenes cerrados por infracciones (no clasifican)");
    table(doc, [{ label: "Candidato", w: 250 }, { label: "Correo", w: 200 }, { label: "Infr.", w: 40, align: "center" }], r.excluded.map((e) => [e.name, e.email, String(e.flagCount)]));
  }

  if (r.questions.length) {
    h2(doc, "Dificultad por pregunta");
    for (const [i, q] of r.questions.entries()) {
      ensure(doc, 28);
      const y = doc.y;
      doc.fillColor(C.ink).font("Helvetica").fontSize(9);
      doc.text(fit(doc, `${i + 1}. ${q.text}`, CONTENT_W - 215), PAGE.m, y, { width: CONTENT_W - 215, lineBreak: false });
      bar(doc, PAGE.m + CONTENT_W - 200, y + 3, 100, q.pctCorrect, q.pctCorrect < 40 ? C.orange : C.blue);
      doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(8.5).text(`${q.pctCorrect}%  ·  x${q.weight}`, PAGE.m + CONTENT_W - 92, y + 1, { width: 92, align: "right", lineBreak: false });
      doc.y = y + 20;
    }
    doc.x = PAGE.m;
  }

  h2(doc, "Metodología");
  const lines = [
    `Método aplicado: ${METHOD_INFO[d.method].label}. ${METHOD_INFO[d.method].description}`,
    d.method !== "raw" ? (r.difficultyReliable ? "El peso de cada pregunta es 1 + (1 - p), donde p es la proporción de candidatos que la acertó (entre 1 y 2)." : "Con menos de 5 entregas la dificultad no es confiable: todas las preguntas pesan igual.") : "",
    d.method === "integrity" ? `Se restan ${STRIKE_PENALTY} puntos del índice por cada infracción de seguridad registrada (mínimo 0).` : "",
    "Desempates: menos infracciones, menor tiempo utilizado y entrega más temprana. Solo se clasifican exámenes entregados.",
    r.hasOpenQuestions ? "Las preguntas abiertas no se califican automáticamente y no forman parte del índice." : "",
  ].filter(Boolean);
  doc.fillColor(C.muted).font("Helvetica").fontSize(9).text(lines.map((l) => `•  ${safe(l)}`).join("\n"), { width: CONTENT_W, lineGap: 3 });

  // Firmas
  ensure(doc, 90);
  doc.moveDown(3);
  const sy = doc.y + 20;
  [0, 1].forEach((i) => {
    const x = PAGE.m + i * (CONTENT_W / 2 + 10);
    doc.moveTo(x, sy).lineTo(x + CONTENT_W / 2 - 30, sy).lineWidth(0.8).strokeColor(C.faint).stroke();
    doc.fillColor(C.muted).font("Helvetica").fontSize(8.5).text(i === 0 ? "Elaborado por" : "Revisado por la Junta Directiva", x, sy + 5, { width: CONTENT_W / 2 - 30, lineBreak: false });
  });
  return finish(doc, generatedBy);
}
