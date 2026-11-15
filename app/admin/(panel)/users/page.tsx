import { Suspense } from "react";
import type { Metadata } from "next";
import { Users } from "lucide-react";
import UsersManager from "@/components/admin/UsersManager";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { listAdmins } from "@/actions/users";

export const metadata: Metadata = { title: "Administradores · ASIGBO Proctoring" };

async function UsersContent() {
  const data = await listAdmins();
  if (!data) return null; // el shell ya redirige al login
  return (
    <UsersManager
      me={data.me}
      admins={data.admins.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      }))}
    />
  );
}

export default function UsersPage() {
  return (
    <PageContainer>
      <PageHeader
        icon={Users}
        eyebrow="Administración"
        title="Administradores"
        description="Personas de la Junta Directiva con acceso al panel."
      />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <UsersContent />
      </Suspense>
    </PageContainer>
  );
}
