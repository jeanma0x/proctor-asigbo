import { Suspense } from "react";
import type { Metadata } from "next";
import { FileBarChart } from "lucide-react";
import Gate from "@/components/admin/Gate";
import ReportsCenter from "@/components/admin/ReportsCenter";
import { PageContainer, PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Reportes · ASIGBO Proctoring" };

export default function ReportsPage() {
  return (
    <PageContainer>
      <PageHeader icon={FileBarChart} eyebrow="Histórico" title="Reportes" description="Informes con membrete de ASIGBO, por candidato o por grupo, listos para imprimir o archivar." />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="results:export"><ReportsCenter /></Gate>
      </Suspense>
    </PageContainer>
  );
}
