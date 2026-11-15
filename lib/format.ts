const TZ = "America/Guatemala";

/** Fecha/hora con zona horaria fija: idéntica en servidor y cliente (evita errores de hidratación). */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(d));
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeZone: TZ }).format(new Date(d));
}

export function initials(name: string | null | undefined, email: string): string {
  const src = (name?.trim() || email.split("@")[0]).split(/[\s._-]+/).filter(Boolean);
  return ((src[0]?.[0] ?? "?") + (src[1]?.[0] ?? "")).toUpperCase();
}

/** Fecha y hora con segundos (para actas e infracciones), en hora de Guatemala. */
export function fmtDateTimeSec(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-GT", { dateStyle: "short", timeStyle: "medium", timeZone: TZ }).format(new Date(d));
}
