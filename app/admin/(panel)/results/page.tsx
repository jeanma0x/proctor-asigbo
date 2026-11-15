import { Suspense } from "react";
import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import Gate from "@/components/admin/Gate";
import ResultsExplorer from "@/components/admin/ResultsExplorer";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { getAdmin } from "@/lib/require-admin";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Resultados · ASIGBO Proctoring" };

async function Content() {
  const admin = await getAdmin();
  return <ResultsExplorer canExport={can(admin?.role, "results:export")} />;
}

export default function ResultsPage() {
  return (
    <PageContainer>
      <PageHeader
        icon={ClipboardCheck}
        eyebrow="Histórico"
        title="Resultados"
        description="Historial de todas las evaluaciones, por convocatoria. Abre un candidato para ver sus respuestas."
      />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="results:view"><Content /></Gate>
      </Suspense>
    </PageContainer>
  );
}
