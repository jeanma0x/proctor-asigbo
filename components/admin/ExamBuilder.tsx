"use client";

import { useRef, useState, useTransition } from "react";
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

export default function ExamBuilder() {
  const [mode, setMode] = useState<"manual" | "csv">("manual");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(60);
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => [initialQuestion()]);
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

  const submitManual = () => {
    setResult(null);
    startTransition(async () => {
      const res = await createExamManual({
        title,
        description,
        durationMinutes: duration,
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
    setResult(null);
    startTransition(async () => {
      const res = await importExamFromCsv({ title, description, durationMinutes: duration }, csvRows);
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
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
          ASIGBO Proctoring · Admin
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Exam Builder</h1>
        <p className="mt-1 text-slate-500">Configura el examen y agrega preguntas manualmente o por CSV.</p>
      </header>

      {/* Configuración general */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Clock className="h-5 w-5 text-blue-600" /> Configuración del examen
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
            <span className="mb-1 block text-sm font-medium">Descripción (opcional)</span>
            <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
      </section>

      {/* Selector de modo */}
      <div className="mb-6 inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-lg">
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
      </div>

      {mode === "manual" ? (
        <section className="space-y-6">
          {questions.map((q, idx) => (
            <article key={q.id} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
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
                    className="mt-1 flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
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
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
          >
            <Plus className="h-4 w-4" /> Agregar pregunta
          </button>

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {questions.length} pregunta(s) · {totalPoints} punto(s)
            </p>
            <button
              type="button"
              onClick={submitManual}
              disabled={pending}
              className="rounded-xl bg-asigbo-blue px-6 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:bg-asigbo-blue-dark disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar examen"}
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <Upload className="h-5 w-5 text-blue-600" /> Importar desde CSV
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
              disabled={pending || csvRows.length === 0}
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
          <span>
            {result.ok
              ? `Examen creado en estado DRAFT con ${result.questionCount} pregunta(s). ID: ${result.examId}`
              : result.error}
          </span>
        </div>
      )}
    </div>
  );
}
