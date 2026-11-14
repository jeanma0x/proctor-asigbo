"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Activity, AlertTriangle, CheckCircle2, Clock, ShieldAlert, Users } from "lucide-react";
import { getInProgressSessions, type LiveSession } from "@/actions/live";

type EventType = LiveSession["auditLogs"][number]["type"];

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

function formatElapsed(from: Date | string | null, now: number) {
  if (!from) return "—";
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function timeAgo(date: Date | string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(date).getTime()) / 1000));
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
}

export default function LiveDashboard() {
  const { data, error, isLoading, isValidating } = useSWR("live-sessions", getInProgressSessions, {
    refreshInterval: 3000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  // Reloj local para el tiempo transcurrido (independiente del polling).
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);


  const sessions = data ?? [];
  const isAlert = (s: LiveSession) =>
    s.flagCount > 0 || (s.auditLogs[0] ? SEVERE_EVENTS.includes(s.auditLogs[0].type) : false);
  const alertCount = sessions.filter(isAlert).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
            ASIGBO Proctoring · Admin
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Live Proctoring</h1>
          <p className="mt-1 text-slate-500">Candidatos con examen en progreso · actualización cada 3 s</p>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 ${
                isValidating ? "animate-ping" : "opacity-0"
              }`}
            />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          En vivo
        </span>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
          <Users className="h-8 w-8 text-blue-600" />
          <div>
            <p className="text-2xl font-bold">{sessions.length}</p>
            <p className="text-sm text-slate-500">Candidatos en examen</p>
          </div>
        </div>
        <div
          className={`flex items-center gap-4 rounded-xl border p-5 shadow-sm ${
            alertCount > 0 ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
          }`}
        >
          <AlertTriangle className={`h-8 w-8 ${alertCount > 0 ? "text-red-600" : "text-slate-400"}`} />
          <div>
            <p className={`text-2xl font-bold ${alertCount > 0 ? "text-red-700" : ""}`}>{alertCount}</p>
            <p className="text-sm text-slate-500">Con alertas de fraude</p>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          No se pudo actualizar el panel. Reintentando automáticamente…
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Candidato</th>
              <th className="px-4 py-3 font-semibold">Examen</th>
              <th className="px-4 py-3 font-semibold">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Tiempo
                </span>
              </th>
              <th className="px-4 py-3 text-center font-semibold">Infracciones</th>
              <th className="px-4 py-3 font-semibold">Último evento</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                  <Activity className="mx-auto mb-2 h-6 w-6 animate-pulse" />
                  Cargando sesiones…
                </td>
              </tr>
            )}
            {!isLoading && sessions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                  <CheckCircle2 className="mx-auto mb-2 h-6 w-6" />
                  No hay candidatos con examen en progreso.
                </td>
              </tr>
            )}
            {sessions.map((s) => {
              const alert = isAlert(s);
              const last = s.auditLogs[0];
              const limitMs = s.exam.durationMinutes * 60_000;
              const overtime = s.startedAt ? now - new Date(s.startedAt).getTime() > limitMs : false;
              return (
                <tr
                  key={s.id}
                  className={`border-t border-l-4 transition-colors ${
                    alert
                      ? "border-t-red-100 border-l-red-500 bg-red-50"
                      : "border-t-slate-100 border-l-transparent hover:bg-slate-50"
                  }`}
                >
                  <td className="px-4 py-3 align-top">
                    <p className="font-semibold">{s.candidate.fullName}</p>
                    <p className="text-xs text-slate-500">{s.candidate.studentId ?? s.candidate.email}</p>
                    {alert && (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Alerta de Fraude
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">{s.exam.title}</td>
                  <td className="px-4 py-3 align-top font-mono tabular-nums">
                    <span className={overtime ? "font-semibold text-amber-600" : ""}>
                      {formatElapsed(s.startedAt, now)}
                    </span>
                    <p className="font-sans text-xs text-slate-400">de {s.exam.durationMinutes} min</p>
                  </td>
                  <td className="px-4 py-3 text-center align-top">
                    <span
                      className={`inline-flex min-w-8 justify-center rounded-full px-2.5 py-1 text-sm font-bold ${
                        s.flagCount > 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {s.flagCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {last ? (
                      <>
                        <p className={`font-medium ${SEVERE_EVENTS.includes(last.type) ? "text-red-700" : "text-slate-700"}`}>
                          {EVENT_LABEL[last.type]}
                        </p>
                        <p className="text-xs text-slate-500">
                          <code className="rounded bg-white/70 px-1">{last.type}</code> · {timeAgo(last.createdAt, now)}
                        </p>
                        {last.details && <p className="mt-0.5 text-xs text-slate-500">{last.details}</p>}
                      </>
                    ) : (
                      <span className="text-slate-400">Sin incidencias</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
