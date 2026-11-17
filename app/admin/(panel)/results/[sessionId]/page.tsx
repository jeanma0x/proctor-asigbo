import PdfPreview from "@/components/admin/PdfPreview";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Scale } from "lucide-react";
import Gate from "@/components/admin/Gate";
import { PageContainer } from "@/components/admin/ui";
import { card } from "@/components/admin/ui";
import { getResultDetail } from "@/actions/results";
import { getAdmin } from "@/lib/require-admin";
import { can } from "@/lib/permissions";
import { btnPrimary } from "@/components/admin/ui";
import AnswerReview from "@/components/admin/AnswerReview";
import { fmtDateTime } from "@/lib/format";
import { EVENT_LABEL, STATUS_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Detalle de resultado · ASIGBO Proctoring" };

async function Detail({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const [d, admin] = await Promise.all([getResultDetail(sessionId), getAdmin()]);
  if (!d) notFound();
  const canExport = can(admin?.role, "results:export");
  const canGrade = can(admin?.role, "results:grade");
  const pct = d.score != null && d.maxScore ? Math.round((d.score / d.maxScore) * 100) : null;
  const mins = d.startedAt && d.submittedAt ? Math.max(1, Math.round((d.submittedAt.getTime() - d.startedAt.getTime()) / 60000)) : null;
  const st = STATUS_LABEL[d.status];

  return (
    <div className="space-y-6">
      <Link href="/admin/results" className="inline-flex items-center gap-1.5 text-sm font-medium text-asigbo-blue hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a resultados
      </Link>

      <header className={`${card} p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-asigbo-blue">{d.exam.convocatoria?.name ?? "Sin convocatoria"} · {d.exam.title}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight"><Link href={`/admin/candidates/${d.candidate.id}`} className="hover:text-asigbo-blue hover:underline">{d.candidate.fullName}</Link></h1>
            <p className="text-sm text-slate-600">{d.candidate.email}</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${st.cls}`}>{st.label}</span>
            <Link href={`/admin/evaluation/${d.id}`} className={btnPrimary}><Scale className="h-4 w-4" aria-hidden="true" /> Evaluar</Link>
            {canExport && <PdfPreview href={`/admin/reports/candidate/${d.id}/pdf`} title={`Informe de ${d.candidate.fullName}`} className={btnPrimary}><FileText className="h-4 w-4" aria-hidden="true" /> Informe PDF</PdfPreview>}
          </div>
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-4">
          {[
            ["Puntaje", d.score == null ? "—" : `${d.score} / ${d.maxScore}${pct != null ? ` (${pct}%)` : ""}`],
            ["Infracciones", String(d.flagCount)],
            ["Duración", mins ? `${mins} min de ${d.exam.durationMinutes}` : "—"],
            ["Entrega", fmtDateTime(d.submittedAt)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
              <dd className="mt-0.5 font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        {d.pendingGrade > 0 && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Hay {d.pendingGrade} respuesta(s) abierta(s) pendientes de calificar: el puntaje y el ranking aún no las incluyen.{canGrade ? " Califícalas más abajo." : ""}
          </p>
        )}
      </header>

      <AnswerReview sessionId={d.id} questions={d.questions} canGrade={canGrade} />

      <section className={`${card} p-6`}>
        <h2 className="font-semibold">Bitácora de eventos</h2>
        {d.auditLogs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Sin eventos registrados.</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {d.auditLogs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="w-40 shrink-0 text-xs text-slate-500">{fmtDateTime(l.createdAt)}</span>
                <span className={`font-medium ${l.severity === "CRITICAL" ? "text-red-700" : l.severity === "WARNING" ? "text-amber-700" : "text-slate-700"}`}>{EVENT_LABEL[l.type] ?? l.type}</span>
                {l.details && <span className="text-xs text-slate-500">{l.details}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export default function ResultDetailPage(props: { params: Promise<{ sessionId: string }> }) {
  return (
    <PageContainer>
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="results:view"><Detail {...props} /></Gate>
      </Suspense>
    </PageContainer>
  );
}
