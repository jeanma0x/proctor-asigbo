export type SessionStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "TERMINATED";

export const STATUS_LABEL: Record<SessionStatus, { label: string; cls: string }> = {
  NOT_STARTED: { label: "Sin iniciar", cls: "bg-slate-100 text-slate-700" },
  IN_PROGRESS: { label: "En examen", cls: "bg-blue-100 text-blue-800" },
  SUBMITTED: { label: "Entregado", cls: "bg-emerald-100 text-emerald-800" },
  TERMINATED: { label: "Cerrado", cls: "bg-red-100 text-red-800" },
};

export const EVENT_LABEL: Record<string, string> = {
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
  HELP_REQUEST: "Pidió ayuda a la Junta",
  HELP_ATTENDED: "La Junta atendió su solicitud",
  GRACE_GRANTED: "Salida autorizada por la Junta",
  STRIKE_VOIDED: "Infracción anulada por la Junta",
};
