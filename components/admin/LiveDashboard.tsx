"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle, Bell, BellOff, CheckCircle2, ClipboardCopy, Eye, HandHelping, Undo2, Loader2, MonitorPlay, Search, ShieldAlert, Square, Users, Video, WifiOff, X,
} from "lucide-react";
import { attendHelp, getLiveOverview, getSessionDetail, grantLeave, terminateSession, voidInfraction, type LiveSession } from "@/actions/live";
import { card, inputCls } from "@/components/admin/ui";
import { fmtDateTime, fmtDateTimeSec } from "@/lib/format";
import { EVENT_LABEL } from "@/lib/labels";
import { MAX_STRIKES } from "@/lib/proctor-constants";

type Tab = "live" | "done" | "pending";
type Detail = NonNullable<Awaited<ReturnType<typeof getSessionDetail>>>;

/** Eventos que suman infracción (coinciden con STRIKE_EVENTS del servidor). */
const STRIKE_TYPES = new Set(["TAB_CHANGE", "WINDOW_BLUR", "FULLSCREEN_EXIT"]);
/** Intentos que se registran pero no penalizan. */
const SOFT_TYPES = new Set(["PASTE_ATTEMPT", "COPY_ATTEMPT", "CUT_ATTEMPT", "CONTEXT_MENU"]);

type Alert = {
  id: string; sessionId: string; name: string; exam: string; label: string; detail: string | null;
  kind: "strike" | "soft" | "help"; strikeNo: number | null; at: number; read: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
function timeAgo(date: Date | string | number, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(date).getTime()) / 1000));
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
}

function Strikes({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${count} de ${MAX_STRIKES} infracciones`} title={`${count} de ${MAX_STRIKES} infracciones`}>
      {Array.from({ length: MAX_STRIKES }, (_, i) => (
        <span key={i} className={`h-2.5 w-5 rounded-full ${i < count ? (count >= MAX_STRIKES ? "bg-red-600" : "bg-amber-500") : "bg-slate-200"}`} />
      ))}
      <span className="ml-1 text-xs font-semibold tabular-nums text-slate-600">{count}/{MAX_STRIKES}</span>
    </span>
  );
}

/** Acta lista para pegar en el chat de Zoom o en un correo: justifica el cierre con hora exacta por evento. */
function buildActa(d: Detail): string {
  const strikes = d.auditLogs.filter((l) => STRIKE_TYPES.has(l.type) && l.severity !== "INFO" && !l.voidedAt);
  const voided = d.auditLogs.filter((l) => STRIKE_TYPES.has(l.type) && l.severity !== "INFO" && l.voidedAt);
  const excused = d.auditLogs.filter((l) => STRIKE_TYPES.has(l.type) && l.severity === "INFO");
  const soft = d.auditLogs.filter((l) => SOFT_TYPES.has(l.type));
  const lines = [
    `ACTA DE INFRACCIONES · ${d.exam.title}`,
    `Candidato: ${d.candidate.fullName} (${d.candidate.email})`,
    `Inicio del examen: ${fmtDateTimeSec(d.startedAt)}`,
    "",
    `Infracciones registradas: ${strikes.length} de ${MAX_STRIKES}`,
    ...strikes.map((l, i) => `${i + 1}. ${fmtDateTimeSec(l.createdAt)} — ${EVENT_LABEL[l.type] ?? l.type}${l.details ? ` (${l.details})` : ""}`),
  ];
  if (voided.length) {
    lines.push("", `Infracciones anuladas por la Junta: ${voided.length}`);
    lines.push(...voided.map((l) => `· ${fmtDateTimeSec(l.createdAt)} — ${EVENT_LABEL[l.type] ?? l.type} (anulada por ${l.voidedBy ?? "la Junta"}: ${l.voidReason ?? "sin motivo"})`));
  }
  if (excused.length) {
    lines.push("", `Salidas autorizadas por la Junta: ${excused.length}`);
    lines.push(...excused.map((l) => `· ${fmtDateTimeSec(l.createdAt)} — ${EVENT_LABEL[l.type] ?? l.type}`));
  }
  if (soft.length) {
    lines.push("", `Intentos no penalizados: ${soft.length}`);
    lines.push(...soft.map((l) => `· ${fmtDateTimeSec(l.createdAt)} — ${EVENT_LABEL[l.type] ?? l.type}`));
  }
  lines.push("", d.status === "TERMINATED"
    ? (d.flagCount >= MAX_STRIKES
      ? `Resultado: examen cerrado automáticamente al alcanzar ${MAX_STRIKES} infracciones. Según las reglas aceptadas por el candidato, el examen queda anulado.`
      : "Resultado: examen cerrado por la Junta Directiva.")
    : d.status === "SUBMITTED" ? "Resultado: examen entregado." : "Estado: examen en curso.");
  return lines.join("\n");
}

function beep() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.5);
    o.onended = () => void ctx.close();
  } catch { /* sin audio disponible */ }
}

function DetailPanel({
  session, canTerminate, now, onClose, onTerminated,
}: { session: LiveSession; canTerminate: boolean; now: number; onClose: () => void; onTerminated: () => void }) {
  const { data, isLoading, mutate: reloadDetail } = useSWR(["session-detail", session.id], () => getSessionDetail(session.id), { refreshInterval: 3000, keepPreviousData: true });
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [voidFor, setVoidFor] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = data?.status ?? session.status;
  const flags = data?.flagCount ?? session.flagCount;
  const reachedLimit = flags >= MAX_STRIKES;
  const acta = data ? buildActa(data) : "";

  const copy = async () => {
    try { await navigator.clipboard.writeText(acta); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setErr("No se pudo copiar. Selecciona el texto manualmente."); }
  };
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    setBusy(true); setErr(null); setNote(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "No se pudo completar la acción.");
    setNote(okText); onTerminated(); await reloadDetail();
  };
  const pendingHelp = data?.helpRequestedAt ?? session.helpRequestedAt;
  const helpText = data?.helpNote ?? session.helpNote;
  const graceUntil = data?.graceUntil ?? session.graceUntil;
  const graceActive = !!graceUntil && !!now && new Date(graceUntil).getTime() > now;
  const close = async () => {
    setBusy(true); setErr(null);
    const res = await terminateSession(session.id);
    setBusy(false); setConfirm(false);
    if (!res.ok) setErr(res.error); else onTerminated();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Detalle de ${session.candidate.fullName}`}>
      <button type="button" aria-label="Cerrar panel" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-900/40" />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <p className="text-lg font-semibold">{session.candidate.fullName}</p>
            <p className="text-sm text-slate-600">{session.candidate.email}</p>
            <p className="mt-1 text-xs text-slate-500">{session.exam.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden="true" /></button>
        </header>

        <div className="space-y-5 p-5">
          <div className="flex items-center justify-between gap-3">
            <Strikes count={flags} />
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === "TERMINATED" ? "bg-red-100 text-red-800" : status === "SUBMITTED" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
              {status === "TERMINATED" ? "Cerrado" : status === "SUBMITTED" ? "Entregado" : status === "IN_PROGRESS" ? "En examen" : "Sin iniciar"}
            </span>
          </div>

          {status === "IN_PROGRESS" && pendingHelp && (
            <div role="alert" className="rounded-xl border-2 border-sky-300 bg-sky-50 p-4 text-sm text-sky-950">
              <p className="flex items-center gap-2 font-semibold"><HandHelping className="h-5 w-5" aria-hidden="true" /> Pide ayuda</p>
              <p className="mt-1">{helpText ?? "Sin detalle"}</p>
              {canTerminate && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => run(() => grantLeave(session.id), "Salida de 2 minutos autorizada. Avísale por el micrófono.")} className="cursor-pointer rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50">Autorizar salida de 2 min</button>
                  <button type="button" disabled={busy} onClick={() => run(() => attendHelp(session.id), "Solicitud marcada como atendida.")} className="cursor-pointer rounded-lg border border-sky-400 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50">Atendida</button>
                </div>
              )}
            </div>
          )}
          {status === "IN_PROGRESS" && !pendingHelp && graceActive && (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-900">Salida autorizada vigente hasta {fmtDateTimeSec(graceUntil)}: salir de la ventana no suma infracción.</p>
          )}
          {status === "IN_PROGRESS" && !pendingHelp && !graceActive && canTerminate && (
            <button type="button" disabled={busy} onClick={() => run(() => grantLeave(session.id), "Salida de 2 minutos autorizada. Avísale por el micrófono.")} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
              Autorizar salida de 2 min (p. ej. revisar Zoom)
            </button>
          )}
          {note && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{note}</p>}

          {(reachedLimit || status === "TERMINATED") && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900">
              <Video className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Pídele que salga de la sesión de Zoom</p>
                <p className="mt-0.5">
                  {reachedLimit ? `Llegó a ${MAX_STRIKES} infracciones y su examen queda anulado.` : "Su examen fue cerrado."} Copia el acta y compártela como justificación.
                </p>
              </div>
            </div>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Línea de tiempo</h3>
            {isLoading && !data ? (
              <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…</p>
            ) : !data?.auditLogs.length ? (
              <p className="text-sm text-slate-500">Sin eventos registrados.</p>
            ) : (
              <ol className="space-y-2">
                {data.auditLogs.map((l) => {
                  const strike = STRIKE_TYPES.has(l.type) && l.severity !== "INFO";
                  const excused = STRIKE_TYPES.has(l.type) && l.severity === "INFO";
                  const voided = !!l.voidedAt;
                  const tone = voided ? "border-slate-200 bg-slate-50 text-slate-500" : excused || l.type === "GRACE_GRANTED" || l.type === "HELP_ATTENDED" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : l.type === "HELP_REQUEST" ? "border-sky-300 bg-sky-50 text-sky-900" : l.severity === "CRITICAL" ? "border-red-300 bg-red-50 text-red-800" : strike ? "border-amber-300 bg-amber-50 text-amber-900" : SOFT_TYPES.has(l.type) ? "border-slate-200 bg-slate-50 text-slate-700" : "border-slate-100 bg-white text-slate-600";
                  return (
                    <li key={l.id} className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={`font-medium ${voided ? "line-through" : ""}`}>{EVENT_LABEL[l.type] ?? l.type}{strike && !voided && <span className="ml-2 text-xs font-semibold uppercase">Infracción</span>}{excused && <span className="ml-2 text-xs font-semibold uppercase">Autorizada</span>}{voided && <span className="ml-2 text-xs font-semibold uppercase no-underline">Anulada</span>}</span>
                        <time className="shrink-0 font-mono text-xs tabular-nums">{fmtDateTimeSec(l.createdAt)}</time>
                      </div>
                      {l.details && <p className="mt-0.5 text-xs opacity-80">{l.details}</p>}
                      {voided && <p className="mt-0.5 text-xs">Anulada por {l.voidedBy ?? "la Junta"}: {l.voidReason}</p>}
                      <p className="mt-0.5 text-xs opacity-60">{now ? timeAgo(l.createdAt, now) : ""}</p>
                      {canTerminate && strike && !voided && (
                        voidFor === l.id ? (
                          <div className="mt-2 space-y-2 border-t border-amber-200 pt-2">
                            <label htmlFor={`vr-${l.id}`} className="block text-xs font-medium">Motivo de la anulación (queda en el acta y la bitácora)</label>
                            <input id={`vr-${l.id}`} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Ej.: autorizado por micrófono para revisar Zoom" className="block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-asigbo-blue" />
                            <div className="flex gap-2">
                              <button type="button" disabled={busy || voidReason.trim().length < 5} onClick={async () => { await run(() => voidInfraction(session.id, l.id, voidReason), "Infracción anulada."); setVoidFor(null); setVoidReason(""); }} className="cursor-pointer rounded-lg bg-slate-800 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50">Anular infracción</button>
                              <button type="button" onClick={() => { setVoidFor(null); setVoidReason(""); }} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium hover:bg-amber-100">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => { setVoidFor(l.id); setVoidReason(""); }} className="mt-1.5 inline-flex cursor-pointer items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"><Undo2 className="h-3 w-3" aria-hidden="true" /> Anular</button>
                        )
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {data && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Acta / justificación</h3>
                <button type="button" onClick={copy} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? "¡Copiada!" : "Copiar acta"}
                </button>
              </div>
              <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-800">{acta}</pre>
            </section>
          )}

          {err && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p>}

          {canTerminate && status === "IN_PROGRESS" && (
            <div className="border-t border-slate-200 pt-4">
              {confirm ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="w-full text-sm text-slate-700">El examen se cierra de inmediato y el candidato no podrá continuar.</p>
                  <button type="button" disabled={busy} onClick={close} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Sí, cerrar examen
                  </button>
                  <button type="button" onClick={() => setConfirm(false)} className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirm(true)} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                  <Square className="h-4 w-4" aria-hidden="true" /> Cerrar examen de este candidato
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default function LiveDashboard({ canTerminate }: { canTerminate: boolean }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [soundOn, setSoundOn] = useState(false);
  const soundRef = useRef(false);
  const seen = useRef<Set<string> | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const processAlerts = useCallback((sessions: LiveSession[]) => {
    const firstLoad = seen.current === null;
    if (!seen.current) seen.current = new Set();
    const fresh: Alert[] = [];
    for (const s of sessions) {
      for (const l of [...s.auditLogs].reverse()) {
        if (seen.current.has(l.id)) continue;
        seen.current.add(l.id);
        const strike = STRIKE_TYPES.has(l.type) && l.severity !== "INFO";
        const help = l.type === "HELP_REQUEST";
        if (!strike && !help && !SOFT_TYPES.has(l.type)) continue;
        if (firstLoad) continue; // la primera carga no genera ruido
        fresh.push({
          id: l.id, sessionId: s.id, name: s.candidate.fullName, exam: s.exam.title,
          label: EVENT_LABEL[l.type] ?? l.type, detail: l.details,
          kind: help ? "help" : strike ? "strike" : "soft", strikeNo: strike ? Math.min(s.flagCount, MAX_STRIKES) : null,
          at: new Date(l.createdAt).getTime(), read: false,
        });
      }
    }
    if (!fresh.length) return;
    setAlerts((prev) => [...fresh.reverse(), ...prev].slice(0, 40));
    const strikes = fresh.filter((a) => a.kind === "strike" || a.kind === "help");
    if (soundRef.current && strikes.length) beep();
    if (strikes.length && typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
      const a = strikes[0];
      new Notification(a.kind === "help" ? `Pide ayuda: ${a.name}` : `Infracción${a.strikeNo ? ` ${a.strikeNo}/${MAX_STRIKES}` : ""}: ${a.name}`, { body: a.kind === "help" ? (a.detail ?? a.label) : a.label });
    }
  }, []);

  const { data, error, isLoading, mutate } = useSWR("live-overview", getLiveOverview, {
    refreshInterval: 3000,
    revalidateOnFocus: true,
    keepPreviousData: true,
    onSuccess: processAlerts,
  });

  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);

  const unread = alerts.filter((a) => !a.read && a.kind !== "soft").length;
  useEffect(() => {
    const base = "Monitoreo en vivo · ASIGBO Proctoring";
    document.title = unread ? `(${unread}) ⚠ Atención · ${base}` : base;
    return () => { document.title = base; };
  }, [unread]);

  const toggleAlerts = async () => {
    if (soundOn) { soundRef.current = false; setSoundOn(false); return; }
    soundRef.current = true; setSoundOn(true); beep();
    if (typeof Notification !== "undefined" && Notification.permission === "default") await Notification.requestPermission();
  };

  const [tab, setTab] = useState<Tab>("live");
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all = useMemo(() => data ?? [], [data]);
  const live = all.filter((s) => s.status === "IN_PROGRESS");
  const done = all.filter((s) => s.status === "SUBMITTED" || s.status === "TERMINATED");
  const pendingList = all.filter((s) => s.status === "NOT_STARTED");
  const withStrikes = live.filter((s) => s.flagCount > 0);
  const terminated = done.filter((s) => s.status === "TERMINATED").length;
  const selected = all.find((s) => s.id === selectedId) ?? null;

  // Cierres automáticos recientes (3 infracciones): el aviso de «pídele que salga de Zoom» queda visible hasta descartarlo.
  const limitHits = all.filter((s) => s.status === "TERMINATED" && s.flagCount >= MAX_STRIKES && !dismissed.has(s.id)
    && s.auditLogs[0] && now && now - new Date(s.auditLogs[0].createdAt).getTime() < 6 * 3600_000);

  const exams = useMemo(() => [...new Map(all.map((s) => [s.exam.id, s.exam.title])).entries()], [all]);
  const q = search.trim().toLowerCase();
  const rows = (tab === "live" ? live : tab === "done" ? done : pendingList)
    .filter((s) => (!examFilter || s.exam.id === examFilter) &&
      (!q || s.candidate.fullName.toLowerCase().includes(q) || s.candidate.email.toLowerCase().includes(q) || (s.candidate.studentId ?? "").toLowerCase().includes(q)))
    .sort((a, b) => (tab === "live" ? b.flagCount - a.flagCount : 0));

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "live", label: "En progreso", count: live.length },
    { key: "done", label: "Finalizados", count: done.length },
    { key: "pending", label: "Sin iniciar", count: pendingList.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-600"}`}>
          {error ? <WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> : (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          )}
          {error ? "Sin conexión · reintentando…" : "En vivo · se actualiza cada 3 s"}
        </span>
        <button type="button" onClick={toggleAlerts} aria-pressed={soundOn} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors ${soundOn ? "border-asigbo-blue bg-asigbo-blue/10 text-asigbo-blue" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          {soundOn ? <Bell className="h-3.5 w-3.5" aria-hidden="true" /> : <BellOff className="h-3.5 w-3.5" aria-hidden="true" />}
          {soundOn ? "Alertas con sonido activadas" : "Activar sonido y avisos"}
        </button>
      </div>

      {/* Aviso crítico: tercera infracción */}
      {limitHits.map((s) => (
        <div key={s.id} role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-red-400 bg-red-50 p-4 text-red-900 shadow-sm">
          <Video className="h-6 w-6 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{s.candidate.fullName} llegó a {MAX_STRIKES} infracciones: examen anulado</p>
            <p className="text-sm">Pídele que salga de la sesión de Zoom. Abre el detalle para copiar el acta con las horas exactas.</p>
          </div>
          <button type="button" onClick={() => setSelectedId(s.id)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700"><Eye className="h-4 w-4" aria-hidden="true" /> Ver acta</button>
          <button type="button" onClick={() => setDismissed((p) => new Set(p).add(s.id))} className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100">Ya la retiré</button>
        </div>
      ))}

      {/* Solicitudes de ayuda pendientes */}
      {live.filter((s) => s.helpRequestedAt).map((s) => (
        <div key={`help-${s.id}`} role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-sky-300 bg-sky-50 p-4 text-sky-950 shadow-sm">
          <HandHelping className="h-6 w-6 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{s.candidate.fullName} pide ayuda</p>
            <p className="text-sm">{s.helpNote ?? "Sin detalle"}</p>
          </div>
          <button type="button" onClick={() => setSelectedId(s.id)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-sky-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-sky-800"><Eye className="h-4 w-4" aria-hidden="true" /> Atender</button>
        </div>
      ))}

      {/* Resumen */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Users, label: "En examen ahora", value: live.length, tone: "text-asigbo-blue bg-asigbo-blue/10" },
          { icon: AlertTriangle, label: "Con infracciones", value: withStrikes.length, tone: withStrikes.length ? "text-amber-700 bg-amber-100" : "text-slate-500 bg-slate-100", alert: withStrikes.length > 0 },
          { icon: CheckCircle2, label: "Entregaron", value: done.length - terminated, tone: "text-emerald-700 bg-emerald-100" },
          { icon: ShieldAlert, label: "Cerrados (infracciones/Junta)", value: terminated, tone: terminated ? "text-red-600 bg-red-100" : "text-slate-500 bg-slate-100" },
        ].map(({ icon: Icon, label, value, tone, alert }) => (
          <div key={label} className={`flex items-center gap-4 rounded-2xl border p-5 shadow-sm ${alert ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <p className="text-2xl font-bold tabular-nums">{value}</p>
              <p className="text-sm text-slate-600">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Feed de infracciones en vivo */}
      <section className={`${card} overflow-hidden`} aria-label="Infracciones en vivo">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden="true" /> Infracciones en vivo
            {unread > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{unread} nueva{unread > 1 ? "s" : ""}</span>}
          </h2>
          {alerts.length > 0 && (
            <button type="button" onClick={() => setAlerts((p) => p.map((a) => ({ ...a, read: true })))} className="cursor-pointer text-xs font-medium text-slate-600 underline-offset-2 hover:underline">Marcar como vistas</button>
          )}
        </div>
        {alerts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Sin infracciones nuevas. Cuando un candidato cometa una, aparecerá aquí al instante.</p>
        ) : (
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
            {alerts.map((a) => (
              <li key={a.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 text-sm ${a.kind !== "soft" && !a.read ? (a.kind === "help" ? "bg-sky-50" : "bg-amber-50") : ""}`}>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${a.kind === "help" ? "bg-sky-600 text-white" : a.kind === "strike" ? (a.strikeNo === MAX_STRIKES ? "bg-red-600 text-white" : "bg-amber-500 text-white") : "bg-slate-200 text-slate-700"}`}>
                  {a.kind === "help" ? "Ayuda" : a.kind === "strike" ? `${a.strikeNo}/${MAX_STRIKES}` : "Intento"}
                </span>
                <div className="min-w-0 flex-1">
                  <p><span className="font-semibold">{a.name}</span> · {a.label}</p>
                  <p className="text-xs text-slate-500">{a.detail ? `${a.detail} · ` : ""}{now ? timeAgo(a.at, now) : ""}</p>
                </div>
                <button type="button" onClick={() => { setSelectedId(a.sessionId); setAlerts((p) => p.map((x) => (x.sessionId === a.sessionId ? { ...x, read: true } : x))); }} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Ver detalle
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div role="tablist" aria-label="Estado de las sesiones" className="flex rounded-xl bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.key} role="tab" type="button" aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-asigbo-blue ${tab === t.key ? "bg-white text-asigbo-blue shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                {t.label} <span className="ml-1 text-xs tabular-nums text-slate-500">{t.count}</span>
              </button>
            ))}
          </div>
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input aria-label="Buscar candidato" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar candidato" className={`${inputCls} pl-9`} />
          </div>
          {exams.length > 1 && (
            <select aria-label="Filtrar por examen" value={examFilter} onChange={(e) => setExamFilter(e.target.value)} className={`${inputCls} !w-auto`}>
              <option value="">Todos los exámenes</option>
              {exams.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
            </select>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Candidato</th>
                <th className="px-4 py-3 font-semibold">Examen</th>
                <th className="px-4 py-3 font-semibold">{tab === "live" ? "Tiempo" : tab === "done" ? "Resultado" : "Estado"}</th>
                <th className="px-4 py-3 font-semibold">Infracciones</th>
                <th className="px-5 py-3"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="px-4 py-14 text-center text-slate-400"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" aria-hidden="true" />Cargando sesiones…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-14 text-center text-slate-500">
                    <MonitorPlay className="mx-auto mb-2 h-7 w-7 text-slate-300" aria-hidden="true" />
                    {tab === "live" ? "No hay candidatos con examen en progreso." : tab === "done" ? "Aún no hay exámenes finalizados." : "No hay aspirantes pendientes de iniciar."}
                  </td>
                </tr>
              )}
              {rows.map((s) => {
                const hot = s.status === "IN_PROGRESS" && s.flagCount > 0;
                const limit = s.exam.durationMinutes * 60_000;
                const elapsed = s.startedAt && now ? now - new Date(s.startedAt).getTime() : 0;
                const overtime = elapsed > limit;
                return (
                  <tr key={s.id} className={`border-t border-l-4 transition-colors ${hot ? (s.flagCount >= MAX_STRIKES - 1 ? "border-t-red-100 border-l-red-500 bg-red-50" : "border-t-amber-100 border-l-amber-400 bg-amber-50") : "border-t-slate-100 border-l-transparent hover:bg-slate-50"}`}>
                    <td className="px-5 py-3 align-top">
                      <p className="font-semibold">{s.candidate.fullName}</p>
                      <p className="text-xs text-slate-500">{s.candidate.studentId ?? s.candidate.email}</p>
                      {s.status === "IN_PROGRESS" && s.helpRequestedAt && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-600 px-2 py-0.5 text-xs font-semibold text-white"><HandHelping className="h-3 w-3" aria-hidden="true" /> Pide ayuda</span>}
                      {s.status === "IN_PROGRESS" && s.graceUntil && now > 0 && new Date(s.graceUntil).getTime() > now && <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Salida autorizada</span>}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-700">{s.exam.title}</td>
                    <td className="px-4 py-3 align-top">
                      {tab === "live" && (
                        <div className="min-w-32">
                          <p className={`font-mono tabular-nums ${overtime ? "font-semibold text-amber-600" : ""}`}>{now ? clock(elapsed) : "—"}</p>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Tiempo consumido" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((elapsed / limit) * 100))}>
                            <div className={`h-full rounded-full ${overtime ? "bg-amber-500" : "bg-asigbo-blue"}`} style={{ width: `${Math.min(100, (elapsed / limit) * 100)}%` }} />
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">de {s.exam.durationMinutes} min</p>
                        </div>
                      )}
                      {tab === "done" && (
                        <>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.status === "TERMINATED" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                            {s.status === "TERMINATED" ? "Cerrado" : "Entregado"}
                          </span>
                          {s.status === "SUBMITTED" && <p className="mt-1 text-sm font-semibold tabular-nums">{s.score ?? 0} pts</p>}
                          <p className="mt-0.5 text-xs text-slate-500">{fmtDateTime(s.submittedAt)}</p>
                        </>
                      )}
                      {tab === "pending" && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Sin iniciar</span>}
                    </td>
                    <td className="px-4 py-3 align-top"><Strikes count={s.flagCount} /></td>
                    <td className="px-5 py-3 align-top text-right">
                      {s.status !== "NOT_STARTED" && (
                        <button type="button" onClick={() => setSelectedId(s.id)} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${hot ? "border-slate-400 bg-white text-slate-800 hover:bg-slate-50" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Detalle
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <DetailPanel
          key={selected.id}
          session={selected}
          canTerminate={canTerminate}
          now={now}
          onClose={() => setSelectedId(null)}
          onTerminated={() => { void mutate(); }}
        />
      )}
    </div>
  );
}
