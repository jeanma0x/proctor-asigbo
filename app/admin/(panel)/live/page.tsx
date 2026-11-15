import { Suspense } from "react";
import type { Metadata } from "next";
import { MonitorPlay } from "lucide-react";
import Gate from "@/components/admin/Gate";
import LiveDashboard from "@/components/admin/LiveDashboard";
import { PageContainer, PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = {
  title: "Monitoreo en vivo · ASIGBO Proctoring",
  description: "Supervisa en tiempo real a los aspirantes que están presentando el examen.",
};

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
        <Gate permission="live:view"><LiveDashboard /></Gate>
      </Suspense>
    </PageContainer>
  );
}
