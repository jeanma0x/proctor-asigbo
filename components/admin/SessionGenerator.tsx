"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Copy, Link2, Rocket, Users } from "lucide-react";
import { generateSessions, type GeneratedSession } from "@/actions/sessions";
import { publishExam } from "@/actions/exam";
import { parseCandidates } from "@/lib/parse-candidates";

type ExamOption = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  durationMinutes: number;
  questionCount: number;
};

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200";

export default function SessionGenerator({ exams }: { exams: ExamOption[] }) {
  const router = useRouter();
  const published = exams.filter((e) => e.status === "PUBLISHED");
  const drafts = exams.filter((e) => e.status === "DRAFT");

  const [examId, setExamId] = useState(published[0]?.id ?? "");
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<GeneratedSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = useMemo(() => parseCandidates(raw), [raw]);
  // Si el examen seleccionado ya no existe/publicado (p. ej. tras refrescar), usa el primero disponible.
  const effectiveExamId = published.some((e) => e.id === examId) ? examId : (published[0]?.id ?? "");

  const absolute = (path: string) => `${window.location.origin}${path}`;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      setError("No se pudo copiar al portapapeles. Selecciona el enlace manualmente.");
    }
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await generateSessions(effectiveExamId, parsed);
      if (res.ok) setRows(res.rows);
      else setError(res.error);
    });
  };

  const publish = (id: string) => {
    setError(null);
    startTransition(async () => {
      const res = await publishExam(id);
      if (res.ok) {
        setExamId(id);
        router.refresh();
      } else setError(res.error);
    });
  };

  const allAsText = rows.map((r) => `${r.name}\t${r.email}\t${absolute(r.path)}`).join("\n");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">ASIGBO Proctoring · Admin</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Enlaces de acceso</h1>
        <p className="mt-1 text-slate-500">Genera un enlace único por aspirante para enviarlo por correo o WhatsApp.</p>
      </header>

      {drafts.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-amber-900">
            <Rocket className="h-4 w-4" /> Exámenes en borrador
          </h2>
          <ul className="space-y-2">
            {drafts.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm shadow-sm">
                <span>
                  <span className="font-medium">{e.title}</span>{" "}
                  <span className="text-slate-500">· {e.questionCount} preguntas · {e.durationMinutes} min</span>
                </span>
                <button
                  type="button"
                  onClick={() => publish(e.id)}
                  disabled={pending || e.questionCount === 0}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-40"
                >
                  Publicar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="grid gap-4">
          <label>
            <span className="mb-1 block text-sm font-medium">Examen publicado</span>
            <select
              className={inputCls}
              value={effectiveExamId}
              onChange={(e) => setExamId(e.target.value)}
              disabled={published.length === 0}
            >
              {published.length === 0 && <option value="">No hay exámenes publicados</option>}
              {published.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} ({e.questionCount} preguntas · {e.durationMinutes} min)
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium">Aspirantes</span>
            <textarea
              className={`${inputCls} font-mono`}
              rows={6}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"Ana Pérez, ana@correo.com, Luis Gómez <luis@correo.com>\nmaria@correo.com"}
            />
            <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <Users className="h-3.5 w-3.5" /> {parsed.length} aspirante(s) detectado(s). Formato: «Nombre, correo» separados
              por comas o saltos de línea; el nombre es opcional.
            </span>
          </label>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={pending || !effectiveExamId || parsed.length === 0}
            className="flex items-center gap-2 rounded-xl bg-asigbo-blue px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:bg-asigbo-blue-dark disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" /> {pending ? "Generando…" : "Generar enlaces"}
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5" /> {error}
        </div>
      )}

      {rows.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{rows.length} enlace(s) listos</h2>
            <button
              type="button"
              onClick={() => copy("all", allAsText)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50"
            >
              {copied === "all" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              Copiar todo (TSV)
            </button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Correo</th>
                  <th className="px-4 py-3 font-semibold">Magic Link</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sessionId} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">
                      {r.name}
                      {r.existing && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                          ya existía
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.email}</td>
                    <td className="max-w-xs px-4 py-3">
                      <code className="block truncate rounded bg-slate-100 px-2 py-1 text-xs" title={absolute(r.path)}>
                        {absolute(r.path)}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => copy(r.sessionId, absolute(r.path))}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        {copied === r.sessionId ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied === r.sessionId ? "Copiado" : "Copiar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
