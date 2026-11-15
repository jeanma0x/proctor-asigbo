import { Suspense } from "react";
import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import DashboardView from "@/components/admin/DashboardView";
import Gate from "@/components/admin/Gate";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { getDashboard } from "@/actions/dashboard";

export const metadata: Metadata = { title: "Dashboard · ASIGBO Proctoring" };

async function Content({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const data = await getDashboard(typeof c === "string" ? c : undefined);
  if (!data) return null;
  return <DashboardView data={data} />;
}

export default function DashboardPage(props: { searchParams: Promise<{ c?: string }> }) {
  return (
    <PageContainer>
      <PageHeader
        icon={LayoutDashboard}
        eyebrow="Resumen"
        title="Dashboard"
        description="Cómo va la convocatoria y cómo se compara con años anteriores."
      />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="dashboard:view"><Content {...props} /></Gate>
      </Suspense>
    </PageContainer>
  );
}
