"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { gradeAnswer } from "@/actions/grading";
import { btnPrimary } from "@/components/admin/ui";

/** Calificación manual de una respuesta abierta (0..puntos, pasos de 0.5). */
export default function GradeControl({ sessionId, questionId, points, current }: { sessionId: string; questionId: string; points: number; current: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current == null ? "" : String(current));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await gradeAnswer(sessionId, questionId, Number(value));
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: `Guardada. Puntaje total: ${res.score}` });
      router.refresh();
    });
  };

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div>
        <label htmlFor={`g-${questionId}`} className="block text-xs font-medium text-slate-700">Nota (0 a {points})</label>
        <input id={`g-${questionId}`} type="number" min={0} max={points} step={0.5} value={value} onChange={(e) => setValue(e.target.value)} className="mt-1 w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-asigbo-blue focus:ring-2 focus:ring-asigbo-blue/30" />
      </div>
      <button type="button" onClick={save} disabled={pending || value === ""} className={btnPrimary}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />} {current == null ? "Calificar" : "Actualizar nota"}
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}
