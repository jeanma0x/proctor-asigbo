import { Suspense } from "react";
import type { Metadata } from "next";
import { MonitorPlay } from "lucide-react";
import Gate from "@/components/admin/Gate";
import LiveDashboard from "@/components/admin/LiveDashboard";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { getAdmin } from "@/lib/require-admin";
import { can } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Monitoreo en vivo · ASIGBO Proctoring",
  description: "Supervisa en tiempo real a los aspirantes que están presentando el examen.",
};

async function LiveBody() {
  const admin = await getAdmin();
  return <LiveDashboard canTerminate={can(admin?.role, "live:terminate")} />;
}

export default function LivePage() {
  return (
    <PageContainer>
      <PageHeader
        icon={MonitorPlay}
        eyebrow="Gestión"
        title="Monitoreo en vivo"
        description="Supervisa en tiempo real a los aspirantes y actúa ante posibles fraudes."
      />
      <Suspense fallback={null}>
        <Gate permission="live:view"><LiveBody /></Gate>
      </Suspense>
    </PageContainer>
  );
}
