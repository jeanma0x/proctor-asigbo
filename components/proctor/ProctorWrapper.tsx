"use client";

import Image from "next/image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { AlertTriangle, Ban, Expand, Lock, MonitorX, ShieldAlert, ShieldCheck } from "lucide-react";
import { logInfraction, startSession } from "@/actions/proctor";
import { MAX_STRIKES } from "@/lib/proctor-constants";

type Phase = "welcome" | "active" | "finished" | "terminated";
type Warning = { type: "TAB_CHANGE" | "WINDOW_BLUR" | "FULLSCREEN_EXIT"; strike: number };

type ProctorContextValue = {
  /** Instante límite en ms (epoch del servidor). */
  deadlineMs: number;
  /** serverNow - clientNow; sumar a Date.now() para obtener la hora del servidor. */
  clockOffsetMs: number;
  strikes: number;
  /** Llamar al entregar: detiene el monitoreo y sale de pantalla completa. */
  finish: () => void;
};

const ProctorContext = createContext<ProctorContextValue | null>(null);

export function useProctor() {
  const ctx = useContext(ProctorContext);
  if (!ctx) throw new Error("useProctor debe usarse dentro de <ProctorWrapper>");
  return ctx;
}

const WARNING_TEXT: Record<Warning["type"], string> = {
  TAB_CHANGE: "Cambiaste de pestaña o minimizaste el navegador.",
  WINDOW_BLUR: "La ventana del examen perdió el foco.",
  FULLSCREEN_EXIT: "Saliste del modo de pantalla completa.",
};

/** Ventana (ms) en la que eventos encadenados (blur + visibilitychange + fullscreen) cuentan como uno solo. */
const STRIKE_DEBOUNCE_MS = 1500;
const SOFT_EVENT_DEBOUNCE_MS = 2000;

export default function ProctorWrapper({
  sessionId,
  candidateName,
  examTitle,
  initialFlagCount,
  children,
}: {
  sessionId: string;
  candidateName: string;
  examTitle: string;
  initialFlagCount: number;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>("welcome");
  const [strikes, setStrikes] = useState(initialFlagCount);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [warning, setWarning] = useState<Warning | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [timing, setTiming] = useState({ deadlineMs: 0, clockOffsetMs: 0 });

  const phaseRef = useRef<Phase>("welcome");
  const strikesRef = useRef(initialFlagCount);
  const lastStrikeAt = useRef(0);
  const lastSoftAt = useRef<Record<string, number>>({});

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  /** Incidencia con strike: debounce, modal inmediato y reconciliación con el servidor. */
  const reportStrike = useCallback(
    async (type: Warning["type"], details: string) => {
      if (phaseRef.current !== "active") return;
      const now = Date.now();
      if (now - lastStrikeAt.current < STRIKE_DEBOUNCE_MS) return;
      lastStrikeAt.current = now;

      setWarning({ type, strike: Math.min(strikesRef.current + 1, MAX_STRIKES) });
      const res = await logInfraction(sessionId, type, details);
      if (!res.ok) return;
      strikesRef.current = res.flagCount;
      setStrikes(res.flagCount);
      if (res.terminated) {
        setWarning(null);
        setPhaseBoth("terminated");
        exitFullscreen();
      }
    },
    [sessionId, exitFullscreen, setPhaseBoth],
  );

  /** Incidencia sin strike (copiar/pegar/cortar/menú contextual): solo auditoría. */
  const reportSoft = useCallback(
    (type: "PASTE_ATTEMPT" | "COPY_ATTEMPT" | "CUT_ATTEMPT" | "CONTEXT_MENU", details: string) => {
      if (phaseRef.current !== "active") return;
      const now = Date.now();
      if (now - (lastSoftAt.current[type] ?? 0) < SOFT_EVENT_DEBOUNCE_MS) return;
      lastSoftAt.current[type] = now;
      void logInfraction(sessionId, type, details);
    },
    [sessionId],
  );

  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      // Evita que el blur/visibility residual del cambio de modo cuente como strike.
      lastStrikeAt.current = Date.now();
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleStart = async () => {
    setStartError(null);
    setStarting(true);
    // requestFullscreen debe ejecutarse dentro del gesto del usuario, antes de cualquier await del servidor.
    const fsPromise = document.documentElement.requestFullscreen();
    try {
      await fsPromise;
    } catch {
      setStarting(false);
      setStartError("Tu navegador no permitió la pantalla completa. Es obligatoria para rendir el examen.");
      return;
    }
    const res = await startSession(sessionId);
    if (!res.ok) {
      exitFullscreen();
      setStarting(false);
      setStartError(res.error);
      return;
    }
    lastStrikeAt.current = Date.now();
    setTiming({
      deadlineMs: new Date(res.startedAt).getTime() + res.durationMinutes * 60_000,
      clockOffsetMs: new Date(res.serverNow).getTime() - Date.now(),
    });
    strikesRef.current = res.flagCount;
    setStrikes(res.flagCount);
    setIsFullscreen(true);
    setPhaseBoth("active");
    setStarting(false);
  };

  const finish = useCallback(() => {
    setPhaseBoth("finished");
    setWarning(null);
    exitFullscreen();
  }, [exitFullscreen, setPhaseBoth]);

  // Monitoreo de foco / pantalla completa / teclado (solo mientras el examen está activo).
  useEffect(() => {
    if (phase !== "active") return;

    const onFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) void reportStrike("FULLSCREEN_EXIT", "Salió de pantalla completa");
    };
    const onVisibility = () => {
      if (document.hidden) void reportStrike("TAB_CHANGE", "La pestaña dejó de ser visible");
    };
    const onBlur = () => void reportStrike("WINDOW_BLUR", "La ventana perdió el foco");

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.key === "F12" || (mod && e.shiftKey && ["i", "j", "c"].includes(key)) || (mod && key === "u")) {
        e.preventDefault();
        return;
      }
      if (mod && (key === "c" || key === "v" || key === "x")) {
        e.preventDefault();
        if (key === "v") reportSoft("PASTE_ATTEMPT", "Atajo de teclado Ctrl/Cmd+V");
        else if (key === "c") reportSoft("COPY_ATTEMPT", "Atajo de teclado Ctrl/Cmd+C");
        else reportSoft("CUT_ATTEMPT", "Atajo de teclado Ctrl/Cmd+X");
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [phase, reportStrike, reportSoft]);

  // Aviso nativo si intenta recargar/cerrar durante el examen.
  useEffect(() => {
    if (phase !== "active") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  const blockMouse = (e: MouseEvent) => {
    e.preventDefault();
    reportSoft("CONTEXT_MENU", "Menú contextual bloqueado");
  };
  const blockClipboard =
    (type: "PASTE_ATTEMPT" | "COPY_ATTEMPT" | "CUT_ATTEMPT") => (e: ClipboardEvent) => {
      e.preventDefault();
      reportSoft(type, "Evento de portapapeles bloqueado");
    };

  const ctx = useMemo<ProctorContextValue>(
    () => ({ ...timing, strikes, finish }),
    [timing, strikes, finish],
  );

  // ───────────── Pantallas ─────────────

  if (phase === "terminated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="max-w-md rounded-xl border border-red-900 bg-slate-900 p-8 text-center shadow-2xl">
          <Ban className="mx-auto mb-4 h-14 w-14 text-red-600" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Examen terminado</h1>
          <p className="mt-3 text-slate-300">
            Tu sesión fue cerrada por alcanzar {MAX_STRIKES} infracciones de las reglas de integridad. La Junta
            Directiva revisará el registro de incidencias.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "welcome") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-6 text-white">
        <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
          <ShieldCheck className="mb-4 h-12 w-12 text-blue-400" />
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">ASIGBO Proctoring</p>
          <h1 className="mt-1 text-2xl font-bold">{examTitle}</h1>
          <p className="mt-1 text-slate-300">Candidato: {candidateName}</p>

          <ul className="mt-6 space-y-2 text-sm text-slate-300">
            <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" /> El examen se rinde en pantalla completa obligatoria.</li>
            <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" /> Cambiar de pestaña, perder el foco o salir de pantalla completa es una infracción.</li>
            <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" /> Copiar, pegar, cortar y el menú contextual están deshabilitados.</li>
            <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> Al llegar a {MAX_STRIKES} infracciones tu examen se termina automáticamente.</li>
          </ul>

          {strikes > 0 && (
            <p className="mt-4 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-300">
              Ya tienes {strikes}/{MAX_STRIKES} infracciones registradas en esta sesión.
            </p>
          )}
          {startError && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{startError}</p>}

          <div className="mt-8 flex justify-center">
            <div className="rounded-xl bg-white px-5 py-3 shadow-md">
              <Image alt="ASIGBO Logo" src="/logo-asigbo.png" width={180} height={55} priority className="h-auto w-[180px]" />
            </div>
          </div>

          <button
            type="button"
            onClick={handleStart}
            disabled={starting}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-asigbo-blue px-6 py-3 font-semibold text-white shadow-lg ring-1 ring-blue-300/40 transition-colors hover:bg-asigbo-blue-dark disabled:opacity-60"
          >
            <Expand className="h-5 w-5" />
            {starting ? "Iniciando…" : "Iniciar Examen en Pantalla Completa"}
          </button>
        </div>
      </div>
    );
  }

  const showFullscreenLock = phase === "active" && !isFullscreen;
  const showWarning = phase === "active" && isFullscreen && warning;

  return (
    <ProctorContext.Provider value={ctx}>
      <div
        className="min-h-screen select-none bg-white"
        onContextMenu={blockMouse}
        onCopy={blockClipboard("COPY_ATTEMPT")}
        onPaste={blockClipboard("PASTE_ATTEMPT")}
        onCut={blockClipboard("CUT_ATTEMPT")}
      >
        {children}
      </div>

      {showFullscreenLock && (
        <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6 text-white backdrop-blur-sm">
          <div className="max-w-md rounded-xl border border-red-900 bg-slate-900 p-8 text-center shadow-2xl">
            <MonitorX className="mx-auto mb-4 h-14 w-14 text-red-500" aria-hidden="true" />
            <h2 className="text-2xl font-bold">Examen bloqueado</h2>
            <p className="mt-2 text-slate-300">Debes volver a pantalla completa para continuar. El tiempo sigue corriendo.</p>
            <p className="mt-3 text-sm font-semibold text-red-400">Infracciones: {strikes}/{MAX_STRIKES}</p>
            <button
              type="button"
              onClick={enterFullscreen}
              className="mt-6 rounded-xl bg-red-800 px-6 py-3 font-semibold text-white shadow-md transition-colors hover:bg-red-700"
            >
              Volver a pantalla completa
            </button>
          </div>
        </div>
      )}

      {showWarning && warning && (
        <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 text-white backdrop-blur-sm">
          <div className="max-w-md rounded-xl border border-red-900 bg-red-950 p-8 text-center shadow-2xl">
            <ShieldAlert className="mx-auto mb-3 h-14 w-14 text-red-400" aria-hidden="true" />
            <h2 className="text-2xl font-bold">
              Advertencia de Fraude (Strike {warning.strike}/{MAX_STRIKES})
            </h2>
            <p className="mt-3 text-red-100">{WARNING_TEXT[warning.type]}</p>
            <p className="mt-2 text-sm text-red-200/80">
              Esta incidencia fue registrada y notificada a la Junta Directiva. Con {MAX_STRIKES} strikes tu examen se
              termina.
            </p>
            <button
              type="button"
              onClick={() => setWarning(null)}
              className="mt-6 rounded-xl bg-red-800 px-6 py-3 font-semibold text-white shadow-md transition-colors hover:bg-red-700"
            >
              Entendido, continuar
            </button>
          </div>
        </div>
      )}
    </ProctorContext.Provider>
  );
}
