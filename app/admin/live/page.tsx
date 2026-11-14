import type { Metadata } from "next";
import LiveDashboard from "@/components/admin/LiveDashboard";

export const metadata: Metadata = {
  title: "Live Proctoring · ASIGBO Proctoring",
  description: "Monitoreo en tiempo real de candidatos con examen en progreso.",
};

export default function LivePage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <LiveDashboard />
    </main>
  );
}
