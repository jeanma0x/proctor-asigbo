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
import { Ban, Clock, Expand, FileQuestion, MonitorX, TriangleAlert } from "lucide-react";
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

/** Marco común de las pantallas del candidato: papel cálido, franja con los colores del logo y logo arriba. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-slate-900">
      <div className="flex h-1.5" aria-hidden="true">
        <span className="flex-1 bg-asigbo-blue" /><span className="flex-1 bg-asigbo-cyan" /><span className="flex-1 bg-asigbo-green" /><span className="flex-1 bg-asigbo-orange" />
      </div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center px-6 py-3">
          <Image alt="ASIGBO" src="/logo-asigbo.png" width={150} height={46} priority className="h-10 w-auto" />
        </div>
      </header>
      {children}
    </div>
  );
}

export default function ProctorWrapper({
  sessionId,
  candidateName,
  examTitle,
  initialFlagCount,
  durationMinutes,
  questionCount,
  totalPoints,
  children,
}: {
  sessionId: string;
  candidateName: string;
  examTitle: string;
  initialFlagCount: number;
  durationMinutes: number;
  questionCount: number;
  totalPoints: number;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>("welcome");
  const [strikes, setStrikes] = useState(initialFlagCount);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [warning, setWarning] = useState<Warning | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
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

  const firstName = candidateName.trim().split(/\s+/)[0] ?? candidateName;

  if (phase === "terminated") {
    return (
      <Shell>
        <div className="mx-auto max-w-lg px-6 py-20 text-center">
          <Ban className="mx-auto mb-5 h-12 w-12 text-amber-600" aria-hidden="true" />
          <h1 className="font-serif text-3xl font-semibold text-slate-900">Tu examen se cerró</h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-700">
            Se registraron {MAX_STRIKES} advertencias de seguridad y, por las reglas del examen, la sesión terminó automáticamente.
          </p>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            La Junta Directiva revisará lo ocurrido y se pondrá en contacto contigo. Ya puedes cerrar esta ventana.
          </p>
        </div>
      </Shell>
    );
  }

  if (phase === "welcome") {
    const rules = [
      "Usa una computadora con buena conexión y, de preferencia, conectada a la corriente.",
      "Cierra otras pestañas, programas y notificaciones antes de empezar.",
      "El examen ocupa toda la pantalla. Si sales de ella, cambias de pestaña o de ventana, se registra una advertencia.",
      "Copiar, pegar y el clic derecho están desactivados durante el examen.",
      `A la tercera advertencia (${MAX_STRIKES}), el examen se cierra automáticamente.`,
      "Tus respuestas se guardan solas. Si se recarga la página no pierdes nada, pero el tiempo sigue corriendo.",
    ];
    return (
      <Shell>
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-10 lg:grid-cols-[1.1fr_1fr] lg:py-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-asigbo-blue">Beca ASIGBO</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">Hola, {firstName}.</h1>
            <p className="mt-4 text-xl leading-relaxed text-slate-700">
              Este es tu examen: <strong className="font-semibold text-slate-900">{examTitle}</strong>. Tómate un momento para leer cómo funciona antes de comenzar.
            </p>
            <dl className="mt-8 grid max-w-md grid-cols-3 divide-x divide-slate-300 border-y border-slate-300 py-4 text-center">
              <div className="px-2"><dt className="flex items-center justify-center gap-1.5 text-sm text-slate-600"><Clock className="h-4 w-4" aria-hidden="true" /> Tiempo</dt><dd className="mt-1 font-serif text-2xl font-semibold">{durationMinutes} min</dd></div>
              <div className="px-2"><dt className="flex items-center justify-center gap-1.5 text-sm text-slate-600"><FileQuestion className="h-4 w-4" aria-hidden="true" /> Preguntas</dt><dd className="mt-1 font-serif text-2xl font-semibold">{questionCount}</dd></div>
              <div className="px-2"><dt className="text-sm text-slate-600">Puntos</dt><dd className="mt-1 font-serif text-2xl font-semibold">{totalPoints}</dd></div>
            </dl>
            {strikes > 0 && (
              <p className="mt-6 max-w-md rounded-lg border border-amber-300 bg-amber-50 p-3 text-base text-amber-950">
                Ya tienes {strikes} de {MAX_STRIKES} advertencias en esta sesión.
              </p>
            )}
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm" aria-labelledby="rules-title">
            <h2 id="rules-title" className="font-serif text-2xl font-semibold text-slate-900">Antes de empezar</h2>
            <ol className="mt-5 space-y-3.5">
              {rules.map((r, i) => (
                <li key={r} className="flex gap-3 text-base leading-relaxed text-slate-800">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-asigbo-blue text-xs font-bold text-white" aria-hidden="true">{i + 1}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>

            <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 p-4 text-base text-slate-900 has-[:checked]:border-asigbo-blue has-[:checked]:bg-asigbo-blue/5">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-asigbo-blue" />
              <span>Leí las reglas y estoy listo(a) para comenzar.</span>
            </label>

            {startError && <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-base text-red-900">{startError}</p>}

            <button
              type="button"
              onClick={handleStart}
              disabled={starting || !acknowledged}
              className="mt-5 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-asigbo-blue px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-asigbo-blue-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Expand className="h-5 w-5" aria-hidden="true" />
              {starting ? "Iniciando…" : "Comenzar el examen"}
            </button>
            <p className="mt-3 text-center text-sm text-slate-600">Al comenzar, el reloj empieza a correr. ¿Algún problema técnico? Avisa a la Junta Directiva antes de iniciar.</p>
          </section>
        </div>
      </Shell>
    );
  }

  const showFullscreenLock = phase === "active" && !isFullscreen;
  const showWarning = phase === "active" && isFullscreen && warning;

  return (
    <ProctorContext.Provider value={ctx}>
      <div
        className="min-h-screen select-none bg-paper"
        onContextMenu={blockMouse}
        onCopy={blockClipboard("COPY_ATTEMPT")}
        onPaste={blockClipboard("PASTE_ATTEMPT")}
        onCut={blockClipboard("CUT_ATTEMPT")}
      >
        {children}
      </div>

      {showFullscreenLock && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="fs-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6">
          <div className="w-full max-w-md rounded-2xl border-t-4 border-amber-500 bg-white p-8 text-center shadow-xl">
            <MonitorX className="mx-auto mb-3 h-10 w-10 text-amber-600" aria-hidden="true" />
            <h2 id="fs-title" className="font-serif text-2xl font-semibold text-slate-900">Vuelve a pantalla completa</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-700">El examen necesita toda la pantalla para continuar. <strong>El tiempo sigue corriendo.</strong></p>
            <p className="mt-3 text-sm font-medium text-slate-600">Advertencias: {strikes} de {MAX_STRIKES}</p>
            <button type="button" onClick={enterFullscreen} className="mt-6 min-h-12 w-full cursor-pointer rounded-xl bg-asigbo-blue px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-asigbo-blue-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue">
              Volver a pantalla completa
            </button>
          </div>
        </div>
      )}

      {showWarning && warning && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="warn-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6">
          <div className="w-full max-w-md rounded-2xl border-t-4 border-amber-500 bg-white p-8 shadow-xl">
            <TriangleAlert className="mb-3 h-10 w-10 text-amber-600" aria-hidden="true" />
            <h2 id="warn-title" className="font-serif text-2xl font-semibold text-slate-900">Advertencia {warning.strike} de {MAX_STRIKES}</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-800">{WARNING_TEXT[warning.type]}</p>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Quedó registrado. {warning.strike >= MAX_STRIKES - 1 ? "Una más y el examen se cierra." : `Con ${MAX_STRIKES} advertencias el examen se cierra automáticamente.`}
            </p>
            <button type="button" onClick={() => setWarning(null)} autoFocus className="mt-6 min-h-12 w-full cursor-pointer rounded-xl bg-asigbo-blue px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-asigbo-blue-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue">
              Entendido, continuar
            </button>
          </div>
        </div>
      )}
    </ProctorContext.Provider>
  );
}
