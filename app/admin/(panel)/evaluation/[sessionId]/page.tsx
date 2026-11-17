import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Flag, UserRound } from "lucide-react";
import Gate from "@/components/admin/Gate";
import AnswerReview from "@/components/admin/AnswerReview";
import EvaluationPanel from "@/components/admin/EvaluationPanel";
import PdfPreview from "@/components/admin/PdfPreview";
import { PageContainer, btnGhost, card } from "@/components/admin/ui";
import { getResultDetail } from "@/actions/results";
import { getEvaluationContext } from "@/actions/evaluation";
import { getAdmin } from "@/lib/require-admin";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { EVENT_LABEL, STATUS_LABEL } from "@/lib/labels";
import { PanelSkeleton } from "@/components/admin/skeletons";

export const metadata: Metadata = { title: "Evaluar candidato · ASIGBO Proctoring" };

async function Review({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const [d, ctx, admin] = await Promise.all([getResultDetail(sessionId), getEvaluationContext(sessionId), getAdmin()]);
  if (!d || !ctx || !admin) notFound();
  const canGrade = can(admin.role, "results:grade");
  const pct = d.score != null && d.maxScore ? Math.round((d.score / d.maxScore) * 100) : null;
  const mins = d.startedAt && d.submittedAt ? Math.max(1, Math.round((d.submittedAt.getTime() - d.startedAt.getTime()) / 60000)) : null;
  const st = STATUS_LABEL[d.status];
  const evaluable = d.status === "SUBMITTED" || d.status === "TERMINATED";
  const incidents = d.auditLogs.filter((l) => l.type !== "SESSION_START" && l.type !== "SESSION_SUBMIT");
  const strikes = d.auditLogs.filter((l) => ["TAB_CHANGE", "WINDOW_BLUR", "FULLSCREEN_EXIT"].includes(l.type) && l.severity !== "INFO");

  return (
    <div className="space-y-5">
      <Link href={`/admin/evaluation?e=${ctx.examId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-asigbo-blue hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a la lista</Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-5">
          <header className={`${card} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-asigbo-blue">{d.exam.convocatoria?.name ?? "Sin convocatoria"} · {d.exam.title}</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight">{d.candidate.fullName}</h1>
                <p className="text-sm text-slate-600">{d.candidate.email}</p>
                {ctx.position && <p className="mt-1 text-xs text-slate-500">Candidato {ctx.position} de {ctx.total} en la lista{ctx.rankPosition ? ` · puesto ${ctx.rankPosition} del ranking` : ""}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${st.cls}`}>{st.label}</span>
                <Link href={`/admin/candidates/${d.candidate.id}`} className={btnGhost}><UserRound className="h-4 w-4" aria-hidden="true" /> Perfil e historial</Link>
                {can(admin.role, "results:export") && <PdfPreview href={`/admin/reports/candidate/${d.id}/pdf`} title={`Informe de ${d.candidate.fullName}`} className={btnGhost}><FileText className="h-4 w-4" aria-hidden="true" /> PDF</PdfPreview>}
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Puntaje", d.score == null ? "—" : `${d.score} / ${d.maxScore}${pct != null ? ` · ${pct}%` : ""}`],
                ["Infracciones", String(d.flagCount)],
                ["Duración", mins ? `${mins} de ${d.exam.durationMinutes} min` : "—"],
                ["Entrega", fmtDateTime(d.submittedAt)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>
              ))}
            </dl>
            {d.status === "TERMINATED" && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">Su examen se cerró ({d.flagCount >= 3 ? "3 infracciones" : "por decisión de la Junta"}); según las reglas aceptadas, no clasifica en el ranking.</p>}
            {d.pendingGrade > 0 && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Hay {d.pendingGrade} respuesta(s) abierta(s) por calificar{canGrade ? " (más abajo)" : ""}: el puntaje aún no las incluye.</p>}
            {strikes.length > 0 && d.status === "SUBMITTED" && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><Flag className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Tuvo {strikes.length} infracción(es) durante el examen. Revisa «Incidentes» abajo.</p>
            )}
          </header>

          <AnswerReview sessionId={d.id} questions={d.questions} canGrade={canGrade && evaluable} />

          <details className={`${card} p-5`}>
            <summary className="cursor-pointer text-sm font-semibold">Incidentes del examen ({incidents.length})</summary>
            {incidents.length === 0 ? <p className="mt-3 text-sm text-slate-600">Sin incidentes registrados.</p> : (
              <ol className="mt-3 space-y-1.5">
                {incidents.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                    <span className="w-40 shrink-0 text-xs text-slate-500">{fmtDateTime(l.createdAt)}</span>
                    <span className={`font-medium ${l.severity === "CRITICAL" ? "text-red-700" : l.severity === "WARNING" ? "text-amber-700" : "text-slate-700"}`}>{EVENT_LABEL[l.type] ?? l.type}</span>
                    {l.details && <span className="text-xs text-slate-500">{l.details}</span>}
                  </li>
                ))}
              </ol>
            )}
          </details>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          {evaluable ? (
            <EvaluationPanel key={d.id} sessionId={d.id} ctx={ctx} canVote={can(admin.role, "evaluation:write")} canDecide={can(admin.role, "ranking:decide")} />
          ) : (
            <p className={`${card} p-5 text-sm text-slate-600`}>Este candidato aún no entrega su examen: se podrá evaluar cuando termine.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function EvaluateCandidatePage(props: { params: Promise<{ sessionId: string }> }) {
  return (
    <PageContainer>
      <Suspense fallback={<PanelSkeleton />}>
        <Gate permission="ranking:view"><Review {...props} /></Gate>
      </Suspense>
    </PageContainer>
  );
}
