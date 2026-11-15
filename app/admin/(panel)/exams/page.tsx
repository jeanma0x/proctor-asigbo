import { Suspense } from "react";
import type { Metadata } from "next";
import { FileText } from "lucide-react";
import ExamsManager from "@/components/admin/ExamsManager";
import Gate from "@/components/admin/Gate";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { listExams } from "@/actions/exams-admin";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Exámenes · ASIGBO Proctoring" };

async function Content() {
  const [exams, convocatorias] = await Promise.all([
    listExams(),
    prisma.convocatoria.findMany({ where: { status: "ACTIVE" }, orderBy: [{ year: "desc" }], select: { id: true, name: true, year: true } }),
  ]);
  return <ExamsManager exams={exams} convocatorias={convocatorias} />;
}

export default function ExamsPage() {
  return (
    <PageContainer>
      <PageHeader icon={FileText} eyebrow="Operación" title="Exámenes" description="Crea, edita, duplica, publica o cierra los exámenes de cada convocatoria." />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="exams:write"><Content /></Gate>
      </Suspense>
    </PageContainer>
  );
}
