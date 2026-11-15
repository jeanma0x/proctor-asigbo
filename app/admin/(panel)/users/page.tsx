import { Suspense } from "react";
import type { Metadata } from "next";
import { Users } from "lucide-react";
import Gate from "@/components/admin/Gate";
import UsersManager from "@/components/admin/UsersManager";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { listAdmins } from "@/actions/users";

export const metadata: Metadata = { title: "Usuarios y roles · ASIGBO Proctoring" };

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
        title="Usuarios y roles"
        description="Quién puede ingresar al panel y qué puede hacer cada persona."
      />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="users:manage"><UsersContent /></Gate>
      </Suspense>
    </PageContainer>
  );
}
