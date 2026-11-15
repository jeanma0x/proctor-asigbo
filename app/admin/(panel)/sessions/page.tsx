import { Suspense } from "react";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import SessionGenerator from "@/components/admin/SessionGenerator";

export const metadata: Metadata = {
  title: "Enlaces de acceso · ASIGBO Proctoring",
  description: "Genera enlaces mágicos de examen para los aspirantes.",
};

async function SessionsContent() {
  const exams = await prisma.exam.findMany({
    where: { status: { in: ["DRAFT", "PUBLISHED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, durationMinutes: true, _count: { select: { questions: true } } },
  });
  return (
    <SessionGenerator
      exams={exams.map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status as "DRAFT" | "PUBLISHED",
        durationMinutes: e.durationMinutes,
        questionCount: e._count.questions,
      }))}
    />
  );
}

export default function SessionsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <Suspense fallback={<p className="p-10 text-slate-400">Cargando…</p>}>
        <SessionsContent />
      </Suspense>
    </main>
  );
}
