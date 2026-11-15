import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import ExamBuilder from "@/components/admin/ExamBuilder";
import Gate from "@/components/admin/Gate";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { getExamForEdit } from "@/actions/exams-admin";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Editar examen · ASIGBO Proctoring" };

async function Editor({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const [exam, convocatorias] = await Promise.all([
    getExamForEdit(examId),
    prisma.convocatoria.findMany({ orderBy: [{ year: "desc" }], select: { id: true, name: true, year: true, status: true } }),
  ]);
  if (!exam) notFound();
  // Se permite elegir la convocatoria actual aunque esté archivada.
  const options = convocatorias.filter((c) => c.status === "ACTIVE" || c.id === exam.convocatoriaId).map(({ id, name, year }) => ({ id, name, year }));
  return <ExamBuilder convocatorias={options} initial={exam} />;
}

export default function EditExamPage(props: { params: Promise<{ examId: string }> }) {
  return (
    <PageContainer>
      <Link href="/admin/exams" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-asigbo-blue hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a exámenes
      </Link>
      <PageHeader icon={Pencil} eyebrow="Operación" title="Editar examen" description="Los cambios se aplican a los candidatos que aún no han iniciado." />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="exams:write"><Editor {...props} /></Gate>
      </Suspense>
    </PageContainer>
  );
}
