import { Suspense } from "react";
import type { Metadata } from "next";
import { Scale } from "lucide-react";
import Gate from "@/components/admin/Gate";
import EvaluationBoard from "@/components/admin/EvaluationBoard";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { PanelSkeleton } from "@/components/admin/skeletons";
import { listRankingExams } from "@/actions/ranking";
import { getAdmin } from "@/lib/require-admin";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Evaluación de la Junta · ASIGBO Proctoring" };

async function Content({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const [{ e }, exams, admin] = await Promise.all([searchParams, listRankingExams(), getAdmin()]);
  return <EvaluationBoard exams={exams} initialExamId={e} canDecide={can(admin?.role, "ranking:decide")} />;
}

export default function EvaluationPage(props: { searchParams: Promise<{ e?: string }> }) {
  return (
    <PageContainer>
      <PageHeader icon={Scale} eyebrow="Selección" title="Evaluación de la Junta" description="Revisen cada perfil: resultado, respuestas e incidentes. Cada miembro deja su voto y comentarios, y la decisión final queda registrada aquí." />
      <Suspense fallback={<PanelSkeleton />}>
        <Gate permission="ranking:view"><Content {...props} /></Gate>
      </Suspense>
    </PageContainer>
  );
}
