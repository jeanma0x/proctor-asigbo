/** Ventana de disponibilidad de un examen. Las fechas se capturan y muestran en hora de Guatemala (UTC-6, sin horario de verano). */
const GT_OFFSET = "-06:00";

/** «YYYY-MM-DDTHH:mm» (input datetime-local, hora de Guatemala) → ISO UTC. Vacío → null. */
export function localToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}:00${GT_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO → «YYYY-MM-DDTHH:mm» en hora de Guatemala, para rellenar un datetime-local. */
export function isoToLocal(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export function parseWindow(opens?: string | null, closes?: string | null): { ok: true; opensAt: Date | null; closesAt: Date | null } | { ok: false; error: string } {
  const o = opens ? new Date(opens) : null;
  const c = closes ? new Date(closes) : null;
  if ((o && Number.isNaN(o.getTime())) || (c && Number.isNaN(c.getTime()))) return { ok: false, error: "Las fechas de apertura o cierre no son válidas." };
  if (o && c && c <= o) return { ok: false, error: "El cierre debe ser posterior a la apertura." };
  return { ok: true, opensAt: o, closesAt: c };
}

/** Estado de la ventana en un instante dado. */
export function windowState(w: { opensAt: Date | null; closesAt: Date | null }, now: Date): "not_open" | "closed" | "open" {
  if (w.opensAt && now < w.opensAt) return "not_open";
  if (w.closesAt && now > w.closesAt) return "closed";
  return "open";
}
