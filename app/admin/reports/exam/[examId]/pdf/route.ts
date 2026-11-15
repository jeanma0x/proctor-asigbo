import { prisma } from "@/lib/prisma";
import { getAdmin, hasPermission } from "@/lib/require-admin";
import { loadRanking } from "@/actions/ranking";
import { buildExamReport } from "@/lib/report-pdf";
import { slug } from "@/lib/csv";
import { logAction } from "@/lib/audit";
import type { RankMethod } from "@/lib/ranking";

const METHODS: RankMethod[] = ["raw", "difficulty", "integrity"];

export async function GET(req: Request, ctx: { params: Promise<{ examId: string }> }) {
  if (!(await hasPermission("results:export"))) return new Response("Tu rol no puede exportar informes.", { status: 403 });
  const { examId } = await ctx.params;
  const m = new URL(req.url).searchParams.get("method") as RankMethod;
  const method = METHODS.includes(m) ? m : "integrity";
  const data = await loadRanking(examId, method);
  if (!data) return new Response("Examen no encontrado.", { status: 404 });

  const [groups, admin] = await Promise.all([prisma.candidateSession.groupBy({ by: ["status"], where: { examId }, _count: { _all: true } }), getAdmin()]);
  const enabled = groups.reduce((n, g) => n + g._count._all, 0);
  const started = groups.filter((g) => g.status !== "NOT_STARTED").reduce((n, g) => n + g._count._all, 0);
  const pdf = await buildExamReport({ exam: data.exam, method, result: data.result, enabled, started }, admin?.name || admin?.email || "ASIGBO");
  const download = new URL(req.url).searchParams.get("download") === "1";
  await logAction({ action: download ? "export.pdf_exam" : "view.pdf_exam", entityType: "exam", entityId: examId, summary: `${download ? "Descargó" : "Visualizó"} el informe PDF grupal de «${data.exam.title}»` });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="informe-${slug(data.exam.title)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
