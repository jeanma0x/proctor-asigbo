"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Loader2, MonitorPlay, Search, ShieldAlert, Square, Users, WifiOff,
} from "lucide-react";
import { getLiveOverview, getSessionLogs, terminateSession, type LiveSession } from "@/actions/live";
import { card, inputCls } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/format";
import { MAX_STRIKES } from "@/lib/proctor-constants";

type EventType = Awaited<ReturnType<typeof getSessionLogs>>[number]["type"];
type Tab = "live" | "done" | "pending";

const SEVERE_EVENTS: EventType[] = ["TAB_CHANGE", "PASTE_ATTEMPT", "FULLSCREEN_EXIT"];

const EVENT_LABEL: Record<EventType, string> = {
  SESSION_START: "Inició el examen",
  SESSION_SUBMIT: "Entregó el examen",
  TAB_CHANGE: "Cambió de pestaña",
  WINDOW_BLUR: "Perdió el foco de la ventana",
  FULLSCREEN_EXIT: "Salió de pantalla completa",
  PASTE_ATTEMPT: "Intentó pegar contenido",
  COPY_ATTEMPT: "Intentó copiar contenido",
  CUT_ATTEMPT: "Intentó cortar contenido",
  CONTEXT_MENU: "Abrió el menú contextual",
  OTHER: "Otro evento",
};

const pad = (n: number) => String(n).padStart(2, "0");
function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
function timeAgo(date: Date | string, now: number) {
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

function Logs({ sessionId, now }: { sessionId: string; now: number }) {
  const { data, isLoading } = useSWR(["logs", sessionId], () => getSessionLogs(sessionId), { refreshInterval: 5000 });
  if (isLoading) return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando historial…</p>;
  if (!data?.length) return <p className="text-sm text-slate-500">Sin eventos registrados.</p>;
  return (
    <ol className="space-y-1.5">
      {data.map((l) => (
        <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span className="w-24 shrink-0 text-xs text-slate-500">{timeAgo(l.createdAt, now)}</span>
          <span className={`font-medium ${l.severity === "CRITICAL" ? "text-red-700" : SEVERE_EVENTS.includes(l.type) ? "text-amber-700" : "text-slate-700"}`}>{EVENT_LABEL[l.type]}</span>
          {l.details && <span className="text-xs text-slate-500">{l.details}</span>}
        </li>
      ))}
    </ol>
  );
}

export default function LiveDashboard() {
  const { data, error, isLoading, mutate } = useSWR("live-overview", getLiveOverview, {
    refreshInterval: 4000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  // Reloj local para el tiempo transcurrido (independiente del polling).
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);

  const [tab, setTab] = useState<Tab>("live");
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const all = useMemo(() => data ?? [], [data]);
  const isAlert = (s: LiveSession) =>
    s.status === "IN_PROGRESS" && (s.flagCount > 0 || (s.auditLogs[0] ? SEVERE_EVENTS.includes(s.auditLogs[0].type) : false));

  const live = all.filter((s) => s.status === "IN_PROGRESS");
  const done = all.filter((s) => s.status === "SUBMITTED" || s.status === "TERMINATED");
  const pendingList = all.filter((s) => s.status === "NOT_STARTED");
  const alertCount = live.filter(isAlert).length;
  const terminated = done.filter((s) => s.status === "TERMINATED").length;

  const exams = useMemo(() => [...new Map(all.map((s) => [s.exam.id, s.exam.title])).entries()], [all]);

  const q = search.trim().toLowerCase();
  const rows = (tab === "live" ? live : tab === "done" ? done : pendingList)
    .filter((s) => (!examFilter || s.exam.id === examFilter) &&
      (!q || s.candidate.fullName.toLowerCase().includes(q) || s.candidate.email.toLowerCase().includes(q) || (s.candidate.studentId ?? "").toLowerCase().includes(q)))
    .sort((a, b) => (tab === "live" ? Number(isAlert(b)) - Number(isAlert(a)) : 0));

  const doTerminate = async (id: string) => {
    setBusy(id);
    setActionError(null);
    const res = await terminateSession(id);
    setBusy(null);
    setConfirm(null);
    if (!res.ok) setActionError(res.error);
    await mutate();
  };

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
          {error ? "Sin conexión · reintentando…" : "En vivo · se actualiza cada 4 s"}
        </span>
      </div>

      {/* Resumen */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Users, label: "En examen ahora", value: live.length, tone: "text-asigbo-blue bg-asigbo-blue/10" },
          { icon: AlertTriangle, label: "Con alertas", value: alertCount, tone: alertCount ? "text-red-600 bg-red-100" : "text-slate-500 bg-slate-100", alert: alertCount > 0 },
          { icon: CheckCircle2, label: "Entregaron", value: done.length - terminated, tone: "text-emerald-700 bg-emerald-100" },
          { icon: ShieldAlert, label: "Cerrados por fraude/Junta", value: terminated, tone: terminated ? "text-red-600 bg-red-100" : "text-slate-500 bg-slate-100" },
        ].map(({ icon: Icon, label, value, tone, alert }) => (
          <div key={label} className={`flex items-center gap-4 rounded-2xl border p-5 shadow-sm ${alert ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <p className="text-2xl font-bold tabular-nums">{value}</p>
              <p className="text-sm text-slate-600">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{actionError}</div>
      )}

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div role="tablist" aria-label="Estado de las sesiones" className="flex rounded-xl bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.key} role="tab" type="button" aria-selected={tab === t.key}
                onClick={() => { setTab(t.key); setOpen(null); setConfirm(null); }}
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
                {tab === "live" && <th className="px-4 py-3 font-semibold">Último evento</th>}
                {tab === "live" && <th className="px-5 py-3"><span className="sr-only">Acciones</span></th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-14 text-center text-slate-400"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" aria-hidden="true" />Cargando sesiones…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-slate-500">
                    <MonitorPlay className="mx-auto mb-2 h-7 w-7 text-slate-300" aria-hidden="true" />
                    {tab === "live" ? "No hay candidatos con examen en progreso." : tab === "done" ? "Aún no hay exámenes finalizados." : "No hay aspirantes pendientes de iniciar."}
                  </td>
                </tr>
              )}
              {rows.map((s) => {
                const alert = isAlert(s);
                const last = s.auditLogs[0];
                const limit = s.exam.durationMinutes * 60_000;
                const elapsed = s.startedAt && now ? now - new Date(s.startedAt).getTime() : 0;
                const overtime = elapsed > limit;
                const expanded = open === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr className={`border-t border-l-4 transition-colors ${alert ? "border-t-red-100 border-l-red-500 bg-red-50" : "border-t-slate-100 border-l-transparent hover:bg-slate-50"}`}>
                      <td className="px-5 py-3 align-top">
                        <p className="font-semibold">{s.candidate.fullName}</p>
                        <p className="text-xs text-slate-500">{s.candidate.studentId ?? s.candidate.email}</p>
                        {alert && (
                          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Alerta de fraude
                          </span>
                        )}
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
                      {tab === "live" && (
                        <td className="px-4 py-3 align-top">
                          {last ? (
                            <>
                              <p className={`font-medium ${SEVERE_EVENTS.includes(last.type) ? "text-red-700" : "text-slate-700"}`}>{EVENT_LABEL[last.type]}</p>
                              <p className="text-xs text-slate-500">{now ? timeAgo(last.createdAt, now) : ""}</p>
                              {last.details && <p className="mt-0.5 text-xs text-slate-500">{last.details}</p>}
                            </>
                          ) : <span className="text-slate-400">Sin incidencias</span>}
                        </td>
                      )}
                      {tab === "live" && (
                        <td className="px-5 py-3 align-top">
                          <div className="flex items-center justify-end gap-2">
                            {confirm === s.id ? (
                              <>
                                <button type="button" disabled={busy === s.id} onClick={() => doTerminate(s.id)} className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                                  {busy === s.id && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Cerrar examen
                                </button>
                                <button type="button" onClick={() => setConfirm(null)} className="cursor-pointer rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
                              </>
                            ) : (
                              <button type="button" onClick={() => setConfirm(s.id)} title="Cerrar el examen de este candidato" className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700">
                                <Square className="h-3.5 w-3.5" aria-hidden="true" /> Cerrar
                              </button>
                            )}
                            <button type="button" onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded} aria-label={`Historial de ${s.candidate.fullName}`} className="cursor-pointer rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100">
                              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {expanded && tab === "live" && (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="px-5 py-4">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Historial de eventos</p>
                          <Logs sessionId={s.id} now={now} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
