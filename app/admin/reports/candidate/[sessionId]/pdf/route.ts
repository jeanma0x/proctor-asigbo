import { prisma } from "@/lib/prisma";
import { getAdmin, hasPermission } from "@/lib/require-admin";
import { getResultDetail } from "@/actions/results";
import { loadRanking } from "@/actions/ranking";
import { buildCandidateReport } from "@/lib/report-pdf";
import { slug } from "@/lib/csv";
import { logAction } from "@/lib/audit";


export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!(await hasPermission("results:export"))) return new Response("Tu rol no puede exportar informes.", { status: 403 });
  const { sessionId } = await ctx.params;
  const d = await getResultDetail(sessionId);
  if (!d) return new Response("Resultado no encontrado.", { status: 404 });

  const [row, rk, admin] = await Promise.all([
    prisma.candidateSession.findUnique({ where: { id: sessionId }, select: { decision: true } }),
    loadRanking(d.exam.id, "integrity"),
    getAdmin(),
  ]);
  const mine = rk?.result.rows.find((r) => r.sessionId === sessionId);
  const pdf = await buildCandidateReport(
    {
      candidate: d.candidate,
      exam: { title: d.exam.title, durationMinutes: d.exam.durationMinutes, convocatoria: d.exam.convocatoria },
      status: d.status,
      score: d.score,
      maxScore: d.maxScore,
      flagCount: d.flagCount,
      startedAt: d.startedAt,
      submittedAt: d.submittedAt,
      decision: row?.decision ?? null,
      position: mine && rk ? { rank: mine.position, of: rk.result.stats.n, percentile: mine.percentile, index: mine.index, method: "integrity" } : null,
      questions: d.questions,
      hasOpenQuestions: d.hasOpenQuestions,
      auditLogs: d.auditLogs,
    },
    admin?.name || admin?.email || "ASIGBO",
  );
  await logAction({ action: "export.pdf_candidate", entityType: "session", entityId: sessionId, summary: `Descargó el informe PDF de ${d.candidate.fullName} en «${d.exam.title}»` });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="informe-${slug(d.candidate.fullName)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
