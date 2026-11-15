import { Suspense } from "react";
import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import Gate from "@/components/admin/Gate";
import RankingView from "@/components/admin/RankingView";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { listRankingExams } from "@/actions/ranking";
import { getAdmin } from "@/lib/require-admin";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Ranking · ASIGBO Proctoring" };

async function Content({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const [{ e }, exams, admin] = await Promise.all([searchParams, listRankingExams(), getAdmin()]);
  return <RankingView exams={exams} canDecide={can(admin?.role, "ranking:decide")} canExport={can(admin?.role, "results:export")} initialExamId={e} />;
}

export default function RankingPage(props: { searchParams: Promise<{ e?: string }> }) {
  return (
    <PageContainer>
      <PageHeader icon={Trophy} eyebrow="Histórico" title="Ranking de candidatos" description="Clasificación transparente al finalizar cada examen, con criterios de desempate y registro de la decisión de la Junta." />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="ranking:view"><Content {...props} /></Gate>
      </Suspense>
    </PageContainer>
  );
}
