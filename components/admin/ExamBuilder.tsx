"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  Clock,
  FileSpreadsheet,
  ImageIcon,
  ListChecks,
  Plus,
  Trash2,
  Type,
  Upload,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { setExamStatus, updateExam, type ExamForEdit } from "@/actions/exams-admin";
import { localToIso } from "@/lib/exam-window";
import {
  createExamManual,
  importExamFromCsv,
  type ActionResult,
  type CsvRow,
  type QuestionTypeInput,
} from "@/actions/exam";

type OptionDraft = { id: string; text: string; isCorrect: boolean };
type QuestionDraft = {
  id: string;
  text: string;
  type: QuestionTypeInput;
  points: number;
  imageUrl: string;
  options: OptionDraft[];
};

const uid = () => crypto.randomUUID();
const newOption = (isCorrect = false): OptionDraft => ({ id: uid(), text: "", isCorrect });
const newQuestion = (): QuestionDraft => ({
  id: uid(),
  text: "",
  type: "MULTIPLE_CHOICE",
  points: 1,
  imageUrl: "",
  options: [newOption(true), newOption()],
});

// Estado inicial determinista (sin aleatoriedad durante el prerender / hidratación).
const initialQuestion = (): QuestionDraft => ({
  id: "q-initial",
  text: "",
  type: "MULTIPLE_CHOICE",
  points: 1,
  imageUrl: "",
  options: [
    { id: "o-initial-a", text: "", isCorrect: true },
    { id: "o-initial-b", text: "", isCorrect: false },
  ],
});

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200";

export type ConvocatoriaOption = { id: string; name: string; year: number };

export default function ExamBuilder({ convocatorias, initial }: { convocatorias: ConvocatoriaOption[]; initial?: ExamForEdit }) {
  const router = useRouter();
  const editing = !!initial;
  const locked = !!initial?.locked;
  const [mode, setMode] = useState<"manual" | "csv">("manual");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [duration, setDuration] = useState(initial?.durationMinutes ?? 60);
  const [convocatoriaId, setConvocatoriaId] = useState(initial?.convocatoriaId || convocatorias[0]?.id || "");
  const [opensLocal, setOpensLocal] = useState(initial?.opensAtLocal ?? "");
  const [closesLocal, setClosesLocal] = useState(initial?.closesAtLocal ?? "");
  const [shuffleQuestions, setShuffleQuestions] = useState(initial?.shuffleQuestions ?? false);
  const [shuffleOptions, setShuffleOptions] = useState(initial?.shuffleOptions ?? false);
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    initial && initial.questions.length
      ? initial.questions.map((q, i) => ({
          id: `q-edit-${i}`,
          text: q.text,
          type: q.type,
          points: q.points,
          imageUrl: q.imageUrl,
          options: q.options.map((o, j) => ({ id: `o-edit-${i}-${j}`, text: o.text, isCorrect: o.isCorrect })),
        }))
      : [initialQuestion()],
  );
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvName, setCsvName] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const updateQuestion = (id: string, patch: Partial<QuestionDraft>) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const updateOption = (qid: string, oid: string, patch: Partial<OptionDraft>) =>
    setQuestions((qs) =>
      qs.map((q) =>
        q.id !== qid
          ? q
          : {
              ...q,
              options: q.options.map((o) => {
                if (o.id === oid) return { ...o, ...patch };
                // Solo una correcta por pregunta
                return patch.isCorrect ? { ...o, isCorrect: false } : o;
              }),
            },
      ),
    );

  const removeOption = (qid: string, oid: string) =>
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.id !== qid) return q;
        const options = q.options.filter((o) => o.id !== oid);
        if (options.length && !options.some((o) => o.isCorrect)) options[0].isCorrect = true;
        return { ...q, options };
      }),
    );

  const handleFile = (file: File | undefined) => {
    setResult(null);
    if (!file) return;
    setCsvName(file.name);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        setCsvRows(res.data);
        if (res.errors.length)
          setResult({ ok: false, error: `CSV con errores de formato: ${res.errors[0].message}` });
      },
      error: (err) => setResult({ ok: false, error: err.message }),
    });
  };

  const submitEdit = () => {
    if (!initial) return;
    setResult(null);
    startTransition(async () => {
      const res = await updateExam(initial.id, {
        title,
        description,
        durationMinutes: duration,
        convocatoriaId,
        shuffleQuestions,
        shuffleOptions,
        opensAt: localToIso(opensLocal),
        closesAt: localToIso(closesLocal),
        questions: locked
          ? undefined
          : questions.map((q) => ({ text: q.text, type: q.type, points: q.points, imageUrl: q.imageUrl, options: q.type === "MULTIPLE_CHOICE" ? q.options : [] })),
      });
      if (!res.ok) return setResult(res);
      router.push("/admin/exams");
      router.refresh();
    });
  };

  const [published, setPublished] = useState(false);
  // Aviso al salir con cambios sin guardar (título o preguntas con contenido).
  const dirty = !editing && !result?.ok && (title.trim() !== "" || questions.some((q) => q.text.trim() !== ""));
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const [publishError, setPublishError] = useState<string | null>(null);
  const publishNow = (examId: string) => {
    setPublishError(null);
    startTransition(async () => {
      const res = await setExamStatus(examId, "PUBLISHED");
      if (res.ok) setPublished(true); else setPublishError(res.error);
    });
  };

  const submitManual = () => {
    setPublished(false);
    setResult(null);
    startTransition(async () => {
      const res = await createExamManual({
        title,
        description,
        durationMinutes: duration,
        convocatoriaId,
        shuffleQuestions,
        shuffleOptions,
        opensAt: localToIso(opensLocal),
        closesAt: localToIso(closesLocal),
        questions: questions.map((q) => ({
          text: q.text,
          type: q.type,
          points: q.points,
          imageUrl: q.imageUrl,
          options: q.type === "MULTIPLE_CHOICE" ? q.options : [],
        })),
      });
      setResult(res);
      if (res.ok) {
        setTitle("");
        setDescription("");
        setQuestions([newQuestion()]);
      }
    });
  };

  const submitCsv = () => {
    setPublished(false);
    setResult(null);
    startTransition(async () => {
      const res = await importExamFromCsv({ title, description, durationMinutes: duration, convocatoriaId, shuffleQuestions, shuffleOptions, opensAt: localToIso(opensLocal), closesAt: localToIso(closesLocal) }, csvRows);
      setResult(res);
      if (res.ok) {
        setCsvRows([]);
        setCsvName("");
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  };

  const totalPoints = questions.reduce((a, q) => a + (q.points || 0), 0);

  return (
    <div className="max-w-4xl">
      {/* Configuración general */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Clock className="h-5 w-5 text-asigbo-blue" /> Configuración del examen
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Título</span>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Examen de Beca 2027" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Duración (minutos)</span>
            <input
              type="number"
              min={1}
              max={600}
              className={inputCls}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>
          <label className="sm:col-span-3">
            <span className="mb-1 block text-sm font-medium">Convocatoria</span>
            <select className={inputCls} value={convocatoriaId} onChange={(e) => setConvocatoriaId(e.target.value)}>
              {convocatorias.length === 0 && <option value="">Crea primero una convocatoria</option>}
              {convocatorias.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.year})</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-500">El examen y sus resultados quedan archivados bajo esta convocatoria.</span>
          </label>
          <label className="sm:col-span-3">
            <span className="mb-1 block text-sm font-medium">Descripción (opcional)</span>
            <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <fieldset className="sm:col-span-3 grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">Disponibilidad (opcional, hora de Guatemala)</legend>
            <label>
              <span className="mb-1 block text-xs text-slate-600">Se abre el</span>
              <input type="datetime-local" className={inputCls} value={opensLocal} onChange={(e) => setOpensLocal(e.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-xs text-slate-600">Se cierra el (último momento para iniciar)</span>
              <input type="datetime-local" className={inputCls} value={closesLocal} onChange={(e) => setClosesLocal(e.target.value)} />
            </label>
            <p className="text-xs text-slate-500 sm:col-span-2">Fuera de esa ventana el candidato no puede iniciar. Quien ya empezó puede terminar su tiempo aunque el examen cierre. Déjalo vacío para no limitar.</p>
          </fieldset>
          <fieldset className="sm:col-span-3 grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">Orden aleatorio</legend>
            {([
              ["Mezclar el orden de las preguntas", "Cada candidato ve las preguntas en un orden distinto (se mantiene si recarga).", shuffleQuestions, setShuffleQuestions],
              ["Mezclar las opciones de respuesta", "Las opciones de opción múltiple también cambian de orden por candidato.", shuffleOptions, setShuffleOptions],
            ] as const).map(([label, hint, on, set]) => (
              <label key={label} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${on ? "border-asigbo-blue bg-asigbo-blue/5" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-1 h-4 w-4 accent-asigbo-blue" />
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-slate-500">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      </section>

      {/* Selector de modo */}
      {!editing && <div className="mb-6 inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        {(
          [
            ["manual", "Manual", ListChecks],
            ["csv", "Carga masiva CSV", FileSpreadsheet],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMode(key);
              setResult(null);
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              mode === key ? "bg-asigbo-blue text-white shadow" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>}

      {locked ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
          <p className="font-semibold">Las preguntas están bloqueadas</p>
          <p className="mt-1">Ya hay candidatos que iniciaron este examen, así que no se pueden modificar preguntas ni puntos sin alterar los resultados históricos. Puedes cambiar título, descripción, duración y orden aleatorio. Para otra versión, duplica el examen desde la lista.</p>
          <button type="button" onClick={submitEdit} disabled={pending} className="mt-4 rounded-xl bg-asigbo-blue px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:bg-asigbo-blue-dark disabled:opacity-50">
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </section>
      ) : mode === "manual" ? (
        <section className="space-y-6">
          {questions.map((q, idx) => (
            <article key={q.id} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                  Pregunta {idx + 1}
                </span>
                <button
                  type="button"
                  disabled={questions.length === 1}
                  onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  aria-label="Eliminar pregunta"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label>
                  <span className="mb-1 block text-sm font-medium">Tipo</span>
                  <select
                    className={inputCls}
                    value={q.type}
                    onChange={(e) => updateQuestion(q.id, { type: e.target.value as QuestionTypeInput })}
                  >
                    <option value="MULTIPLE_CHOICE">Opción múltiple</option>
                    <option value="TEXT">Respuesta de texto</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium">Puntos</span>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={q.points}
                    onChange={(e) => updateQuestion(q.id, { points: Number(e.target.value) })}
                  />
                </label>
                <label>
                  <span className="mb-1 flex items-center gap-1 text-sm font-medium">
                    <ImageIcon className="h-3.5 w-3.5" /> URL de imagen (opcional)
                  </span>
                  <input
                    type="url"
                    className={inputCls}
                    placeholder="https://…"
                    value={q.imageUrl}
                    onChange={(e) => updateQuestion(q.id, { imageUrl: e.target.value })}
                  />
                </label>
                <label className="sm:col-span-3">
                  <span className="mb-1 block text-sm font-medium">Enunciado</span>
                  <textarea
                    className={inputCls}
                    rows={2}
                    value={q.text}
                    onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                  />
                </label>
              </div>

              {q.imageUrl.trim() && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={q.imageUrl}
                  alt="Vista previa"
                  className="mt-4 max-h-48 rounded-lg border border-slate-200 object-contain"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  onLoad={(e) => (e.currentTarget.style.display = "block")}
                />
              )}

              {q.type === "MULTIPLE_CHOICE" ? (
                <div className="mt-5 space-y-2">
                  <p className="text-sm font-medium">Opciones (marca la correcta)</p>
                  {q.options.map((o, oi) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${q.id}`}
                        checked={o.isCorrect}
                        onChange={() => updateOption(q.id, o.id, { isCorrect: true })}
                        className="h-4 w-4 accent-emerald-600"
                        aria-label={`Opción ${oi + 1} correcta`}
                      />
                      <input
                        className={inputCls}
                        placeholder={`Opción ${String.fromCharCode(65 + oi)}`}
                        value={o.text}
                        onChange={(e) => updateOption(q.id, o.id, { text: e.target.value })}
                      />
                      <button
                        type="button"
                        disabled={q.options.length <= 2}
                        onClick={() => removeOption(q.id, o.id)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        aria-label="Quitar opción"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateQuestion(q.id, { options: [...q.options, newOption()] })}
                    className="mt-1 flex items-center gap-1 text-sm font-medium text-asigbo-blue hover:text-blue-800"
                  >
                    <Plus className="h-4 w-4" /> Agregar opción
                  </button>
                </div>
              ) : (
                <p className="mt-5 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  <Type className="h-4 w-4" /> El candidato responderá con texto libre (calificación manual).
                </p>
              )}
            </article>
          ))}

          <button
            type="button"
            onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-500 transition hover:border-blue-400 hover:text-asigbo-blue"
          >
            <Plus className="h-4 w-4" /> Agregar pregunta
          </button>

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {questions.length} pregunta(s) · {totalPoints} punto(s)
            </p>
            <button
              type="button"
              onClick={editing ? submitEdit : submitManual}
              disabled={pending || !convocatoriaId}
              className="rounded-xl bg-asigbo-blue px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:bg-asigbo-blue-dark disabled:opacity-50"
            >
              {pending ? "Guardando…" : editing ? "Guardar cambios" : "Guardar examen"}
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <Upload className="h-5 w-5 text-asigbo-blue" /> Importar desde CSV
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Columnas requeridas:{" "}
            <code className="rounded bg-slate-100 px-1">Pregunta, Tipo, OpcionA, OpcionB, Correcta</code>. Opcionales:{" "}
            <code className="rounded bg-slate-100 px-1">OpcionC, OpcionD, Puntos, ImagenUrl</code>. «Correcta» = A, B, C o D.
          </p>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/40">
            <FileSpreadsheet className="mb-2 h-8 w-8 text-slate-400" />
            <span className="text-sm font-medium">{csvName || "Selecciona un archivo .csv"}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>

          {csvRows.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium">Vista previa ({csvRows.length} filas)</p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      {["Pregunta", "Tipo", "OpcionA", "OpcionB", "Correcta"].map((h) => (
                        <th key={h} className="px-3 py-2 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="max-w-xs truncate px-3 py-2">{r.Pregunta}</td>
                        <td className="px-3 py-2">{r.Tipo}</td>
                        <td className="max-w-[10rem] truncate px-3 py-2">{r.OpcionA}</td>
                        <td className="max-w-[10rem] truncate px-3 py-2">{r.OpcionB}</td>
                        <td className="px-3 py-2">{r.Correcta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={submitCsv}
              disabled={pending || csvRows.length === 0 || !convocatoriaId}
              className="rounded-xl bg-asigbo-blue px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:bg-asigbo-blue-dark disabled:opacity-50"
            >
              {pending ? "Importando…" : "Crear examen desde CSV"}
            </button>
          </div>
        </section>
      )}

      {result && (
        <div
          role="status"
          className={`mt-6 flex items-start gap-3 rounded-xl border p-4 text-sm ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {result.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5" /> : <AlertCircle className="mt-0.5 h-5 w-5" />}
          <div>
            {result.ok ? (
              <>
                <p>Examen guardado como borrador con {result.questionCount} pregunta(s).</p>
                {published ? (
                  <p className="mt-1 font-medium">Publicado. Ya puedes habilitar aspirantes en «Enlaces de Acceso».</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={pending} onClick={() => publishNow(result.examId)} className="cursor-pointer rounded-lg bg-emerald-700 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">Publicar ahora</button>
                    <Link href="/admin/exams" className="rounded-lg border border-emerald-300 px-3.5 py-1.5 text-sm font-medium hover:bg-emerald-100">Ir a Exámenes</Link>
                  </div>
                )}
                {publishError && <p className="mt-1 text-red-700">{publishError}</p>}
              </>
            ) : result.error}
          </div>
        </div>
      )}
    </div>
  );
}
