import { getAdmin } from "@/lib/require-admin";
import { can } from "@/lib/permissions";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Contact } from "lucide-react";
import CandidatesExplorer from "@/components/admin/CandidatesExplorer";
import Gate from "@/components/admin/Gate";
import { PageContainer, PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Candidatos · ASIGBO Proctoring" };

async function Explorer() {
  const admin = await getAdmin();
  return <CandidatesExplorer canEdit={can(admin?.role, "candidates:edit")} isSuper={admin?.role === "SUPERADMIN"} />;
}

export default function CandidatesPage() {
  return (
    <PageContainer>
      <PageHeader icon={Contact} eyebrow="Histórico" title="Candidatos" description="Todas las personas que han participado, con su historial entre convocatorias, notas internas y decisiones." />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="results:view"><Explorer /></Gate>
      </Suspense>
    </PageContainer>
  );
}
