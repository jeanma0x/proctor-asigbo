import { hasPermission } from "@/lib/require-admin";
import { loadRanking } from "@/actions/ranking";
import { csvRow, slug } from "@/lib/csv";
import type { RankMethod } from "@/lib/ranking";

const METHODS: RankMethod[] = ["raw", "difficulty", "integrity"];
const DEC = { SELECTED: "Seleccionado", WAITLIST: "Lista de espera", NOT_SELECTED: "No seleccionado" } as const;

export async function GET(req: Request, ctx: { params: Promise<{ examId: string }> }) {
  if (!(await hasPermission("results:export"))) return new Response("Tu rol no puede exportar informes.", { status: 403 });
  const { examId } = await ctx.params;
  const m = new URL(req.url).searchParams.get("method") as RankMethod;
  const data = await loadRanking(examId, METHODS.includes(m) ? m : "integrity");
  if (!data) return new Response("Examen no encontrado.", { status: 404 });

  const head = ["Posición", "Nombre", "Correo", "Índice", "% bruto", "% ponderado", "Infracciones", "Tiempo (min)", "Percentil", "Observaciones", "Decisión"];
  const lines = [
    csvRow(head),
    ...data.result.rows.map((r) => csvRow([r.position, r.name, r.email, r.index, r.rawPct, r.weightedPct, r.flagCount, r.minutes, r.percentile, r.reviewReasons.join("; "), r.decision ? DEC[r.decision] : ""])),
    ...data.result.excluded.map((e) => csvRow(["-", e.name, e.email, "", "", "", e.flagCount, "", "", "Examen cerrado por infracciones (no clasifica)", e.decision ? DEC[e.decision] : ""])),
  ];
  return new Response("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ranking-${slug(data.exam.title)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
