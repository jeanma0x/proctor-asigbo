import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarRange } from "lucide-react";
import ConvocatoriasManager from "@/components/admin/ConvocatoriasManager";
import Gate from "@/components/admin/Gate";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { listConvocatorias } from "@/actions/convocatorias";
import { getAdmin } from "@/lib/require-admin";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Convocatorias · ASIGBO Proctoring" };

async function Content() {
  const [rows, admin] = await Promise.all([listConvocatorias(), getAdmin()]);
  return <ConvocatoriasManager rows={rows} canManage={can(admin?.role, "convocatorias:manage")} />;
}

export default function ConvocatoriasPage() {
  return (
    <PageContainer>
      <PageHeader
        icon={CalendarRange}
        eyebrow="Histórico"
        title="Convocatorias"
        description="Cada año de becas agrupa sus exámenes y resultados. Nada se borra: se archiva y queda disponible para siempre."
      />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="dashboard:view"><Content /></Gate>
      </Suspense>
    </PageContainer>
  );
}
