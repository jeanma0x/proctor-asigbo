import { Suspense } from "react";
import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import ExamBuilder from "@/components/admin/ExamBuilder";
import Gate from "@/components/admin/Gate";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Constructor de exámenes · ASIGBO Proctoring",
  description: "Crea exámenes de beca manualmente o mediante carga masiva CSV.",
};

async function Builder() {
  const convocatorias = await prisma.convocatoria.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, year: true },
  });
  return <ExamBuilder convocatorias={convocatorias} />;
}

export default function ExamBuilderPage() {
  return (
    <PageContainer>
      <PageHeader
        icon={ClipboardList}
        eyebrow="Gestión"
        title="Constructor de exámenes"
        description="Configura el examen y agrega preguntas manualmente o por carga masiva CSV."
      />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="exams:write"><Builder /></Gate>
      </Suspense>
    </PageContainer>
  );
}
