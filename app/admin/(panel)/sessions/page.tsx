import { Suspense } from "react";
import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { emailConfigured } from "@/lib/email";
import SessionGenerator from "@/components/admin/SessionGenerator";
import { PageContainer, PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = {
  title: "Enlaces de acceso · ASIGBO Proctoring",
  description: "Habilita aspirantes y envíales su enlace personal de examen.",
};

async function SessionsContent() {
  const exams = await prisma.exam.findMany({
    where: { status: { in: ["DRAFT", "PUBLISHED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, durationMinutes: true, _count: { select: { questions: true } } },
  });
  return (
    <SessionGenerator
      emailEnabled={emailConfigured()}
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
    <PageContainer>
      <PageHeader
        icon={KeyRound}
        eyebrow="Gestión"
        title="Enlaces de acceso"
        description="Habilita aspirantes y envíales su enlace personal por correo o WhatsApp."
      />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <SessionsContent />
      </Suspense>
    </PageContainer>
  );
}
