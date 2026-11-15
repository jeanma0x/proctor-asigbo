"use client";

import { Fragment, useRef, useState, useTransition, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Check, CheckCircle2, Copy, Download, FileUp, Info, Link2, Loader2, Mail, MessageCircle,
  Plus, RotateCcw, Rocket, Search, Send, Trash2, UserPlus, X,
} from "lucide-react";
import { generateSessions, listExamSessions, removeSession, resetSession, sendInvitations, type ExamSessionRow } from "@/actions/sessions";
import { publishExam } from "@/actions/exam";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/admin/ui";
import { parseCandidates } from "@/lib/parse-candidates";
import { fmtDate, initials } from "@/lib/format";

type ExamOption = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  durationMinutes: number;
  convocatoria: string | null;
  questionCount: number;
};

const STATUS: Record<ExamSessionRow["status"], { label: string; cls: string }> = {
  NOT_STARTED: { label: "Sin iniciar", cls: "bg-slate-100 text-slate-700" },
  IN_PROGRESS: { label: "En examen", cls: "bg-blue-100 text-blue-800" },
  SUBMITTED: { label: "Entregado", cls: "bg-emerald-100 text-emerald-800" },
  TERMINATED: { label: "Cerrado", cls: "bg-red-100 text-red-800" },
};

function StepTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-asigbo-blue text-sm font-bold text-white">{n}</span>
      <div>
        <h2 className="font-semibold leading-tight">{title}</h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

export default function SessionGenerator({ exams, emailEnabled }: { exams: ExamOption[]; emailEnabled: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const published = exams.filter((e) => e.status === "PUBLISHED");
  const drafts = exams.filter((e) => e.status === "DRAFT");

  const [selected, setSelected] = useState(published[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [tray, setTray] = useState<{ email: string; name: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [askSend, setAskSend] = useState(false);
  const [askPublish, setAskPublish] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "PENDING_EMAIL" | ExamSessionRow["status"]>("ALL");
  const [pending, startTransition] = useTransition();
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [rowPanel, setRowPanel] = useState<{ id: string; kind: "remove" | "reset" } | null>(null);

  const exam = published.find((e) => e.id === selected) ?? published[0];
  const examId = exam?.id ?? "";

  const { data: rows = [], isLoading, mutate } = useSWR(
    examId ? ["exam-sessions", examId] : null,
    () => listExamSessions(examId),
    { refreshInterval: 10_000, keepPreviousData: true },
  );

  const link = (path: string) => `${window.location.origin}${path}`;
  const message = (r: ExamSessionRow) =>
    `Hola ${r.name}, este es tu enlace personal para el examen "${exam?.title}" de ASIGBO. Ábrelo desde una computadora y no lo compartas:\n${link(r.path)}`;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      setNotice({ ok: false, text: "No se pudo copiar al portapapeles. Selecciona el enlace manualmente." });
    }
  };

  /** Agrega a la bandeja todo lo que se detecte en el texto (un correo, una lista o filas pegadas de Excel). */
  const addToTray = (text: string): number => {
    const found = parseCandidates(text);
    if (found.length === 0) return 0;
    setTray((prev) => {
      const have = new Set(prev.map((c) => c.email));
      return [...prev, ...found.filter((c) => !have.has(c.email))];
    });
    return found.length;
  };

  const commitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    if (addToTray(text) === 0) return setDraftError("No encontré un correo válido. Ejemplo: ana@correo.com");
    setDraft("");
    setDraftError(null);
  };

  const onDraftKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
    }
  };

  const onDraftPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    // Una lista (varias líneas, tabs o varios correos) se agrega de inmediato, sin pasar por el campo.
    if (/[\n\t]/.test(text.trim()) || (text.match(/@/g) ?? []).length > 1) {
      e.preventDefault();
      if (addToTray(text) === 0) setDraftError("No encontré correos válidos en lo que pegaste.");
      else setDraftError(null);
    }
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_000_000) return setNotice({ ok: false, text: "El archivo es demasiado grande (máx. 1 MB)." });
    const n = addToTray(await file.text());
    if (n === 0) setNotice({ ok: false, text: "No encontré correos en ese archivo. Debe ser CSV o TXT con una columna de correos." });
    if (fileRef.current) fileRef.current.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void readFile(e.dataTransfer.files?.[0]);
  };

  const existingEmails = new Set(rows.map((r) => r.email));
  const fresh = tray.filter((c) => !existingEmails.has(c.email));
  const alreadyThere = tray.length - fresh.length;

  const enable = () => {
    setNotice(null);
    startTransition(async () => {
      const res = await generateSessions(examId, fresh);
      if (!res.ok) return setNotice({ ok: false, text: res.error });
      setNotice({
        ok: true,
        text: `${res.rows.length} aspirante(s) habilitado(s). Ahora envíales su enlace desde la tabla de abajo.`,
      });
      setTray([]);
      await mutate();
    });
  };

  const rowAction = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      setRowPanel(null);
      if (!res.ok) return setNotice({ ok: false, text: res.error ?? "No se pudo completar la acción." });
      setNotice({ ok: true, text: okText });
      await mutate();
    });
  };

  const showInTable = (email: string) => {
    setSearch(email);
    setFilter("ALL");
    document.getElementById("tabla-aspirantes")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const publish = (id: string) => {
    setNotice(null);
    startTransition(async () => {
      const res = await publishExam(id);
      if (!res.ok) return setNotice({ ok: false, text: res.error });
      setSelected(id);
      router.refresh();
    });
  };

  const sendEmails = async (ids: string[]) => {
    setNotice(null);
    setSendingIds((s) => new Set([...s, ...ids]));
    const res = await sendInvitations(examId, ids);
    setSendingIds((s) => {
      const n = new Set(s);
      ids.forEach((i) => n.delete(i));
      return n;
    });
    if (!res.ok) return setNotice({ ok: false, text: res.error });
    setNotice(
      res.failed.length
        ? { ok: false, text: `${res.sent} enviado(s). Fallaron ${res.failed.length}: ${res.failed.map((f) => f.email).join(", ")}.` }
        : { ok: true, text: `${res.sent} correo(s) enviado(s) correctamente.` },
    );
    await mutate();
  };

  const visible = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false;
    if (filter === "PENDING_EMAIL") return !r.emailSentAt && (r.status === "NOT_STARTED" || r.status === "IN_PROGRESS");
    return filter === "ALL" || r.status === filter;
  });
  const pendingEmailIds = rows.filter((r) => !r.emailSentAt && r.status === "NOT_STARTED").map((r) => r.sessionId);

  const downloadCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ["Nombre,Correo,Estado,Enlace", ...rows.map((r) => [r.name, r.email, STATUS[r.status].label, link(r.path)].map(esc).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `enlaces-${(exam?.title ?? "examen").replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div
          role={notice.ok ? "status" : "alert"}
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {notice.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
          {notice.text}
        </div>
      )}

      {/* Paso 1 */}
      <section className={`${card} p-6`}>
        <StepTitle n={1} title="Elige el examen" hint="Solo los exámenes publicados pueden recibir aspirantes." />
        {published.length === 0 && (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Aún no hay exámenes publicados.{" "}
            <Link href="/admin/exam-builder" className="font-semibold text-asigbo-blue underline">Crea uno en el Constructor</Link>
            {drafts.length > 0 && " o publica uno de los borradores de abajo."}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {published.map((e) => {
            const on = e.id === examId;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelected(e.id)}
                aria-pressed={on}
                className={`cursor-pointer rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue ${
                  on ? "border-asigbo-blue bg-asigbo-blue/5" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{e.title}</span>
                  {on && <CheckCircle2 className="h-5 w-5 shrink-0 text-asigbo-blue" aria-hidden="true" />}
                </span>
                <span className="mt-1 block text-xs text-slate-600">{e.convocatoria ? `${e.convocatoria} · ` : ""}{e.questionCount} preguntas · {e.durationMinutes} min</span>
              </button>
            );
          })}
          {drafts.map((e) => (
            <div key={e.id} className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
              <p className="font-semibold text-amber-950">{e.title}</p>
              <p className="mt-1 text-xs text-amber-900">Borrador · {e.questionCount} preguntas · {e.durationMinutes} min</p>
              <button
                type="button"
                onClick={() => setAskPublish(e.id)}
                disabled={pending || e.questionCount === 0}
                className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Rocket className="h-3.5 w-3.5" aria-hidden="true" /> {e.questionCount === 0 ? "Sin preguntas" : "Publicar examen"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Paso 2 */}
      <section className={`${card} p-6`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <StepTitle n={2} title="Agrega a los aspirantes" hint="Escribe un correo, pega una lista o arrastra un archivo. El nombre se detecta solo y lo puedes corregir." />
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-64 flex-1">
            <UserPlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              aria-label="Correo del aspirante"
              value={draft}
              disabled={!examId}
              onChange={(e) => { setDraft(e.target.value); setDraftError(null); }}
              onKeyDown={onDraftKey}
              onPaste={onDraftPaste}
              placeholder="Escribe un correo y presiona Enter, o pega una lista…"
              className={`${inputCls} pl-9`}
              autoComplete="off"
              inputMode="email"
            />
          </div>
          <button type="button" onClick={commitDraft} disabled={!draft.trim() || !examId} className={btnGhost}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Agregar
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" id="import-file" onChange={(e) => readFile(e.target.files?.[0])} />
          <label htmlFor="import-file" className={`${btnGhost} cursor-pointer`}>
            <FileUp className="h-4 w-4" aria-hidden="true" /> Importar CSV
          </label>
        </div>
        {draftError && <p role="alert" className="mt-2 text-sm text-red-700">{draftError}</p>}

        <div className={`mt-4 rounded-xl border-2 border-dashed transition-colors ${dragging ? "border-asigbo-blue bg-asigbo-blue/5" : "border-slate-200"}`}>
          {tray.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-600">
              <p className="font-medium text-slate-800">La bandeja está vacía</p>
              <p className="mt-1">Copia las columnas de <strong>nombre y correo</strong> desde Excel o Google Sheets y pégalas en el campo de arriba.</p>
              <p className="text-xs text-slate-500">También puedes arrastrar aquí un archivo CSV.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-sm">
                <span className="font-semibold">{tray.length} en la bandeja{alreadyThere > 0 && <span className="ml-2 font-normal text-slate-500">· {alreadyThere} ya tiene(n) acceso</span>}</span>
                <button type="button" onClick={() => setTray([])} className="cursor-pointer text-xs font-medium text-slate-500 hover:text-red-700">Vaciar</button>
              </div>
              <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                {tray.map((c) => {
                  const exists = existingEmails.has(c.email);
                  return (
                    <li key={c.email} className="flex items-center gap-3 px-4 py-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-asigbo-blue/10 text-xs font-bold text-asigbo-blue">{initials(c.name, c.email)}</span>
                      <input
                        aria-label={`Nombre de ${c.email}`}
                        value={c.name}
                        maxLength={120}
                        onChange={(e) => setTray((t) => t.map((x) => (x.email === c.email ? { ...x, name: e.target.value } : x)))}
                        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium hover:border-slate-300 focus:border-asigbo-blue focus:bg-white focus:outline-none"
                      />
                      <span className="hidden min-w-0 shrink truncate text-xs text-slate-500 sm:block sm:max-w-56">{c.email}</span>
                      {exists && (
                        <>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Ya tiene acceso</span>
                          <button type="button" onClick={() => showInTable(c.email)} className="shrink-0 cursor-pointer text-xs font-semibold text-asigbo-blue underline hover:no-underline">Ver en la tabla</button>
                        </>
                      )}
                      <button type="button" onClick={() => setTray((t) => t.filter((x) => x.email !== c.email))} aria-label={`Quitar a ${c.email}`} className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={enable} disabled={pending || !examId || fresh.length === 0} className={btnPrimary}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
            {pending ? "Habilitando…" : fresh.length ? `Habilitar ${fresh.length} aspirante${fresh.length === 1 ? "" : "s"}` : "Habilitar aspirantes"}
          </button>
        </div>
      </section>

      {/* Paso 3 */}
      <section id="tabla-aspirantes" className={`${card} scroll-mt-6`}>
        <div className="p-6 pb-4">
          <StepTitle n={3} title="Envía los enlaces" hint="Cada aspirante tiene un enlace personal e intransferible." />
          {!emailEnabled && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                El envío automático desde el sistema no está configurado (faltan las variables <code>SMTP_*</code> en el servidor).
                Mientras tanto usa <strong>Abrir en mi correo</strong> o <strong>WhatsApp</strong>, que funcionan sin configuración.
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input aria-label="Buscar aspirante" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o correo" className={`${inputCls} pl-9`} />
            </div>
            <select aria-label="Filtrar por estado" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className={`${inputCls} !w-auto`}>
              <option value="ALL">Todos ({rows.length})</option>
              <option value="PENDING_EMAIL">Sin correo enviado</option>
              <option value="NOT_STARTED">Sin iniciar</option>
              <option value="IN_PROGRESS">En examen</option>
              <option value="SUBMITTED">Entregados</option>
              <option value="TERMINATED">Cerrados</option>
            </select>
            {emailEnabled && (
              <button type="button" disabled={pendingEmailIds.length === 0 || sendingIds.size > 0} onClick={() => setAskSend(true)} className={btnPrimary}>
                {sendingIds.size > 0 ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                Enviar a pendientes ({pendingEmailIds.length})
              </button>
            )}
            <button type="button" disabled={rows.length === 0} onClick={downloadCsv} className={btnGhost}>
              <Download className="h-4 w-4" aria-hidden="true" /> CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Aspirante</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Correo</th>
                <th className="px-6 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden="true" /></td></tr>
              )}
              {!isLoading && visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    {rows.length === 0 ? "Aún no hay aspirantes habilitados para este examen. Agrégalos en el paso 2." : "Ningún aspirante coincide con el filtro."}
                  </td>
                </tr>
              )}
              {visible.map((r) => {
                const done = r.status === "SUBMITTED" || r.status === "TERMINATED";
                const sending = sendingIds.has(r.sessionId);
                const mailto = `mailto:${r.email}?subject=${encodeURIComponent(`Tu acceso al examen: ${exam?.title ?? ""}`)}&body=${encodeURIComponent(message(r))}`;
                const wa = `https://wa.me/?text=${encodeURIComponent(message(r))}`;
                return (
                  <Fragment key={r.sessionId}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-6 py-3">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-slate-500">{r.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                      {r.status === "SUBMITTED" && r.score != null && <span className="ml-2 text-xs text-slate-500">{r.score} pts</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      {r.emailSentAt ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Enviado {fmtDate(r.emailSentAt)}</span>
                      ) : (
                        <span className="text-slate-400">No enviado</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={() => copy(r.sessionId, link(r.path))} title="Copiar enlace" className={`${btnGhost} !px-2.5 !py-1.5 text-xs`}>
                          {copied === r.sessionId ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                          {copied === r.sessionId ? "Copiado" : "Copiar"}
                        </button>
                        {r.status === "NOT_STARTED" ? (
                          <button type="button" onClick={() => setRowPanel({ id: r.sessionId, kind: "remove" })} title="Quitar de la lista" aria-label={`Quitar a ${r.name}`} className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-600"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                        ) : (
                          <button type="button" onClick={() => setRowPanel({ id: r.sessionId, kind: "reset" })} title="Reiniciar el intento para que pueda volver a presentar" className={`${btnGhost} !px-2.5 !py-1.5 text-xs`}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reiniciar intento</button>
                        )}
                        {!done && (
                          <>
                            <a href={wa} target="_blank" rel="noopener noreferrer" title="Enviar por WhatsApp" aria-label={`WhatsApp a ${r.name}`} className={`${btnGhost} !px-2.5 !py-1.5 text-xs`}>
                              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> WhatsApp
                            </a>
                            {emailEnabled ? (
                              <button type="button" disabled={sending} onClick={() => sendEmails([r.sessionId])} className={`${btnPrimary} !px-2.5 !py-1.5 text-xs`}>
                                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Mail className="h-3.5 w-3.5" aria-hidden="true" />}
                                {r.emailSentAt ? "Reenviar" : "Enviar correo"}
                              </button>
                            ) : (
                              <a href={mailto} title="Abrir en tu programa de correo" className={`${btnGhost} !px-2.5 !py-1.5 text-xs`}>
                                <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Abrir en mi correo
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                    {rowPanel?.id === r.sessionId && (
                      <tr className="bg-slate-50">
                        <td colSpan={4} className="px-6 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                            <p className="max-w-2xl text-slate-800">
                              {rowPanel.kind === "remove"
                                ? `¿Quitar a ${r.name} de la lista? Su enlace dejará de funcionar. Podrás volver a habilitarla cuando quieras.`
                                : `¿Reiniciar el intento de ${r.name}? Se descartan sus respuestas y puntaje actuales, vuelve a «Sin iniciar» y el mismo enlace sirve de nuevo. Queda registrado en su bitácora.`}
                            </p>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setRowPanel(null)} className={`${btnGhost} !px-3 !py-1.5 text-xs`}>Cancelar</button>
                              <button type="button" disabled={pending} onClick={() => rowAction(rowPanel.kind === "remove" ? () => removeSession(r.sessionId) : () => resetSession(r.sessionId), rowPanel.kind === "remove" ? `${r.name} fue quitado de la lista.` : `Intento de ${r.name} reiniciado. Ya puedes reenviarle el enlace.`)} className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                                {pending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />} {rowPanel.kind === "remove" ? "Quitar" : "Reiniciar intento"}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <ConfirmDialog open={askSend} title={`¿Enviar ${pendingEmailIds.length} correo(s) de invitación?`} description="Cada aspirante pendiente recibirá su enlace personal. Los que ya recibieron correo no se incluyen." confirmLabel={`Enviar ${pendingEmailIds.length} correo(s)`} onCancel={() => setAskSend(false)} onConfirm={() => { setAskSend(false); void sendEmails(pendingEmailIds); }} />
      <ConfirmDialog open={!!askPublish} title="¿Publicar este examen?" description="Los aspirantes habilitados podrán presentarlo con su enlace. Tras iniciar, las preguntas quedan bloqueadas." confirmLabel="Publicar examen" onCancel={() => setAskPublish(null)} onConfirm={() => { const id = askPublish!; setAskPublish(null); publish(id); }} />
    </div>
  );
}
