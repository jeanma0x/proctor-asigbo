"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ChevronLeft, ChevronRight, FastForward, Loader2, MessageSquare, Users } from "lucide-react";
import { saveEvaluation, type getEvaluationContext, type Vote } from "@/actions/evaluation";
import { setDecision } from "@/actions/ranking";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { fmtDateTime } from "@/lib/format";

type Ctx = NonNullable<Awaited<ReturnType<typeof getEvaluationContext>>>;

export const VOTES: { key: Vote; label: string; on: string; chip: string }[] = [
  { key: "SELECTED", label: "Seleccionado", on: "border-emerald-600 bg-emerald-600 text-white", chip: "bg-emerald-100 text-emerald-800" },
  { key: "WAITLIST", label: "Lista de espera", on: "border-amber-500 bg-amber-500 text-white", chip: "bg-amber-100 text-amber-900" },
  { key: "NOT_SELECTED", label: "No seleccionado", on: "border-slate-700 bg-slate-700 text-white", chip: "bg-slate-200 text-slate-700" },
];
const voteLabel = (v: Vote | null) => VOTES.find((x) => x.key === v)?.label ?? "Sin voto";

export default function EvaluationPanel({ sessionId, ctx, canVote, canDecide }: { sessionId: string; ctx: Ctx; canVote: boolean; canDecide: boolean }) {
  const router = useRouter();
  const mine = ctx.evaluations.find((e) => e.mine);
  const others = ctx.evaluations.filter((e) => !e.mine && (e.vote || e.comment.trim()));
  const [vote, setVote] = useState<Vote | null>(mine?.vote ?? null);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [saved, setSaved] = useState({ vote: mine?.vote ?? null, comment: mine?.comment ?? "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [askFinal, setAskFinal] = useState<Vote | "CLEAR" | null>(null);

  const dirty = comment.trim() !== saved.comment.trim();

  const persist = async (next: { vote?: Vote | null; comment?: string }) => {
    setMsg(null);
    const r = await saveEvaluation(sessionId, next);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return false; }
    setSaved((s) => ({ vote: next.vote !== undefined ? next.vote : s.vote, comment: next.comment !== undefined ? next.comment.trim() : s.comment }));
    setMsg({ ok: true, text: "Guardado" });
    return true;
  };

  const pick = (v: Vote) => {
    const next = vote === v ? null : v;
    setVote(next);
    startTransition(async () => { if (await persist({ vote: next, ...(dirty ? { comment } : {}) })) router.refresh(); });
  };
  const saveComment = () => startTransition(async () => { if (await persist({ comment })) router.refresh(); });
  const go = (id: string | null) => {
    if (!id) return;
    startTransition(async () => {
      if (dirty && canVote && !(await persist({ comment }))) return;
      router.push(`/admin/evaluation/${id}`);
    });
  };

  // Mayoría simple de los votos: solo se sugiere si hay un ganador claro.
  const top = VOTES.map((v) => ({ ...v, n: ctx.tally[v.key] })).sort((a, b) => b.n - a.n);
  const majority = top[0].n > 0 && top[0].n > top[1].n ? top[0] : null;
  const decisionChip = VOTES.find((v) => v.key === ctx.decision);

  const doFinal = () => {
    const d = askFinal;
    if (!d) return;
    startTransition(async () => {
      const r = await setDecision(sessionId, d === "CLEAR" ? null : d);
      setAskFinal(null);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {canVote && (
        <section className="rounded-2xl border-2 border-asigbo-blue/30 bg-white p-5 shadow-sm" aria-label="Tu evaluación">
          <h2 className="font-semibold">Tu evaluación</h2>
          <p className="text-xs text-slate-500">Tu voto y comentario quedan guardados con tu nombre.</p>
          <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Tu voto">
            {VOTES.map((v) => (
              <button key={v.key} type="button" role="radio" aria-checked={vote === v.key} onClick={() => pick(v.key)} disabled={pending}
                className={`flex min-h-11 cursor-pointer items-center justify-between rounded-xl border-2 px-4 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue disabled:opacity-60 ${vote === v.key ? v.on : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"}`}>
                {v.label} {vote === v.key && <Check className="h-4 w-4" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <label htmlFor="ev-comment" className="mt-4 block text-sm font-medium text-slate-700">Tu comentario</label>
          <textarea id="ev-comment" rows={4} value={comment} onChange={(e) => setComment(e.target.value.slice(0, 1500))} placeholder="Fortalezas, dudas, contexto familiar o lo que la Junta deba saber…"
            className="mt-1 block w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-asigbo-blue focus:ring-2 focus:ring-asigbo-blue/30" />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span role="status" className={`text-xs ${msg ? (msg.ok ? "text-emerald-700" : "text-red-700") : dirty ? "text-amber-700" : "text-slate-400"}`}>
              {msg ? msg.text : dirty ? "Cambios sin guardar" : saved.comment ? "Comentario guardado" : ""}
            </span>
            <button type="button" onClick={saveComment} disabled={pending || !dirty} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-asigbo-blue px-3.5 py-2 text-sm font-semibold text-white hover:bg-asigbo-blue-dark disabled:cursor-not-allowed disabled:opacity-50">
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Guardar comentario
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Evaluaciones de la Junta">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-asigbo-blue" aria-hidden="true" /> La Junta</h2>
          <span className="text-xs text-slate-500">{ctx.tally.total} de {ctx.voters} han votado</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {VOTES.map((v) => <span key={v.key} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${v.chip}`}>{v.label}: {ctx.tally[v.key]}</span>)}
        </div>
        {others.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Todavía nadie más ha dejado su evaluación.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {others.map((e) => (
              <li key={e.adminId} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{e.adminName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${VOTES.find((v) => v.key === e.vote)?.chip ?? "bg-slate-100 text-slate-600"}`}>{voteLabel(e.vote)}</span>
                </div>
                {e.comment.trim() && <p className="mt-1.5 flex gap-1.5 whitespace-pre-wrap text-slate-700"><MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />{e.comment}</p>}
                <p className="mt-1 text-xs text-slate-400">{fmtDateTime(e.updatedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Decisión final">
        <h2 className="font-semibold">Decisión final</h2>
        <p className="mt-1 text-sm">
          {decisionChip ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${decisionChip.chip}`}>{decisionChip.label}</span> : <span className="text-slate-500">Aún sin decidir.</span>}
          {decisionChip && ctx.decidedBy && <span className="ml-2 text-xs text-slate-500">por {ctx.decidedBy.split("@")[0]}</span>}
        </p>
        {canDecide ? (
          <>
            {majority && ctx.decision !== majority.key && (
              <button type="button" onClick={() => setAskFinal(majority.key)} className="mt-3 w-full cursor-pointer rounded-xl border border-asigbo-blue bg-asigbo-blue/5 px-3 py-2 text-sm font-semibold text-asigbo-blue hover:bg-asigbo-blue/10">
                Aplicar mayoría de la Junta: {majority.label} ({majority.n})
              </button>
            )}
            {!majority && ctx.tally.total > 0 && <p className="mt-3 text-xs text-slate-500">No hay mayoría clara todavía (empate).</p>}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {VOTES.map((v) => (
                <button key={v.key} type="button" onClick={() => setAskFinal(v.key)} disabled={pending || ctx.decision === v.key}
                  className={`min-h-10 cursor-pointer rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors disabled:cursor-default ${ctx.decision === v.key ? v.on : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{v.label}</button>
              ))}
            </div>
            {ctx.decision && <button type="button" onClick={() => setAskFinal("CLEAR")} className="mt-2 cursor-pointer text-xs font-medium text-slate-500 underline-offset-2 hover:underline">Quitar decisión</button>}
          </>
        ) : (
          <p className="mt-2 text-xs text-slate-500">La decisión final la registra un administrador o superadmin.</p>
        )}
      </section>

      <nav className="grid grid-cols-2 gap-2" aria-label="Navegar entre candidatos">
        <button type="button" onClick={() => go(ctx.prevId)} disabled={!ctx.prevId || pending} className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior</button>
        <button type="button" onClick={() => go(ctx.nextId)} disabled={!ctx.nextId || pending} className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Siguiente <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        {canVote && (
          <button type="button" onClick={() => go(ctx.nextPendingId)} disabled={!ctx.nextPendingId || pending} className="col-span-2 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-asigbo-blue px-3 text-sm font-semibold text-white hover:bg-asigbo-blue-dark disabled:cursor-not-allowed disabled:opacity-50">
            <FastForward className="h-4 w-4" aria-hidden="true" /> {ctx.nextPendingId ? "Siguiente sin mi voto" : "Ya votaste a todos"}
          </button>
        )}
        <Link href={`/admin/evaluation?e=${ctx.examId}`} className="col-span-2 text-center text-sm font-medium text-asigbo-blue hover:underline">Volver a la lista</Link>
      </nav>

      {askFinal && (
        <ConfirmDialog open busy={pending} onCancel={() => setAskFinal(null)} onConfirm={doFinal} confirmLabel="Registrar decisión final"
          title={askFinal === "CLEAR" ? "¿Quitar la decisión final?" : `Decisión final: ${voteLabel(askFinal)}`}
          description={askFinal === "CLEAR" ? "El candidato vuelve a quedar sin decisión final. Los votos y comentarios de la Junta se conservan." : "Queda registrada con tu nombre y reemplaza cualquier decisión anterior. Los votos y comentarios de la Junta se conservan."} />
      )}
      {msg && !msg.ok && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{msg.text}</p>}
    </div>
  );
}
