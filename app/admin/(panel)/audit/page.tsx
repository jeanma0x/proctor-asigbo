import { Suspense } from "react";
import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import AuditExplorer from "@/components/admin/AuditExplorer";
import Gate from "@/components/admin/Gate";
import { PageContainer, PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Bitácora · ASIGBO Proctoring" };

export default function AuditPage() {
  return (
    <PageContainer>
      <PageHeader icon={ScrollText} eyebrow="Administración" title="Bitácora de acciones" description="Quién hizo qué y cuándo: decisiones, calificaciones, exámenes, accesos, usuarios y exportaciones." />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="audit:view"><AuditExplorer /></Gate>
      </Suspense>
    </PageContainer>
  );
}
