"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Check, CheckCircle2, Copy, Download, FileUp, Info, Link2, Loader2, Mail, MessageCircle,
  Rocket, Search, Send, Users,
} from "lucide-react";
import { generateSessions, listExamSessions, sendInvitations, type ExamSessionRow } from "@/actions/sessions";
import { publishExam } from "@/actions/exam";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/admin/ui";
import { parseCandidates } from "@/lib/parse-candidates";
import { fmtDate } from "@/lib/format";

type ExamOption = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  durationMinutes: number;
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
  const [raw, setRaw] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "PENDING_EMAIL" | ExamSessionRow["status"]>("ALL");
  const [pending, startTransition] = useTransition();
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());

  const exam = published.find((e) => e.id === selected) ?? published[0];
  const examId = exam?.id ?? "";
  const parsed = useMemo(() => parseCandidates(raw), [raw]);

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

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_000_000) return setNotice({ ok: false, text: "El archivo es demasiado grande (máx. 1 MB)." });
    const text = await file.text();
    setRaw((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
    if (fileRef.current) fileRef.current.value = "";
  };

  const enable = () => {
    setNotice(null);
    startTransition(async () => {
      const res = await generateSessions(examId, parsed);
      if (!res.ok) return setNotice({ ok: false, text: res.error });
      const fresh = res.rows.filter((r) => !r.existing).length;
      const existing = res.rows.length - fresh;
      setNotice({
        ok: true,
        text: `${fresh} aspirante(s) habilitado(s)${existing ? ` · ${existing} ya tenía(n) acceso` : ""}. Ahora envíales su enlace desde la tabla de abajo.`,
      });
      setRaw("");
      await mutate();
    });
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
                <span className="mt-1 block text-xs text-slate-600">{e.questionCount} preguntas · {e.durationMinutes} min</span>
              </button>
            );
          })}
          {drafts.map((e) => (
            <div key={e.id} className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
              <p className="font-semibold text-amber-950">{e.title}</p>
              <p className="mt-1 text-xs text-amber-900">Borrador · {e.questionCount} preguntas · {e.durationMinutes} min</p>
              <button
                type="button"
                onClick={() => publish(e.id)}
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
      <section className={`${card} p-6`}>
        <StepTitle n={2} title="Agrega a los aspirantes" hint="Pega correos (con o sin nombre) o importa un archivo CSV/TXT." />
        <textarea
          aria-label="Aspirantes"
          className={`${inputCls} font-mono`}
          rows={5}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          disabled={!examId}
          placeholder={"Ana Pérez, ana@correo.com\nLuis Gómez <luis@correo.com>\nmaria@correo.com"}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" id="import-file" onChange={(e) => onImportFile(e.target.files?.[0])} />
            <label htmlFor="import-file" className={`${btnGhost} cursor-pointer`}>
              <FileUp className="h-4 w-4" aria-hidden="true" /> Importar archivo
            </label>
            <span className={`flex items-center gap-1.5 ${parsed.length ? "font-semibold text-asigbo-blue" : "text-slate-500"}`}>
              <Users className="h-4 w-4" aria-hidden="true" /> {parsed.length} aspirante(s) detectado(s)
            </span>
          </div>
          <button type="button" onClick={enable} disabled={pending || !examId || parsed.length === 0} className={btnPrimary}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
            {pending ? "Habilitando…" : parsed.length ? `Habilitar ${parsed.length} aspirante(s)` : "Habilitar aspirantes"}
          </button>
        </div>
        {parsed.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Vista previa de aspirantes detectados">
            {parsed.slice(0, 12).map((c) => (
              <li key={c.email} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                <span className="font-medium">{c.name}</span> · {c.email}
              </li>
            ))}
            {parsed.length > 12 && <li className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">+{parsed.length - 12} más</li>}
          </ul>
        )}
      </section>

      {/* Paso 3 */}
      <section className={card}>
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
              <button type="button" disabled={pendingEmailIds.length === 0 || sendingIds.size > 0} onClick={() => sendEmails(pendingEmailIds)} className={btnPrimary}>
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
                <th className="px-6 py-3 text-right font-semibold">Enviar enlace</th>
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
                  <tr key={r.sessionId} className="border-t border-slate-100 hover:bg-slate-50/60">
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
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
