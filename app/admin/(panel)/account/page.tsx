import { Suspense } from "react";
import type { Metadata } from "next";
import { UserCog } from "lucide-react";
import AccountPanel from "@/components/admin/AccountPanel";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { getAdmin } from "@/lib/require-admin";

export const metadata: Metadata = { title: "Mi cuenta · ASIGBO Proctoring" };

async function AccountContent() {
  const admin = await getAdmin();
  if (!admin) return null; // el shell ya redirige al login
  return (
    <AccountPanel
      name={admin.name}
      email={admin.email}
      createdAt={admin.createdAt.toISOString()}
      lastLoginAt={admin.lastLoginAt?.toISOString() ?? null}
    />
  );
}

export default function AccountPage() {
  return (
    <PageContainer>
      <PageHeader
        icon={UserCog}
        eyebrow="Administración"
        title="Mi cuenta"
        description="Tu perfil, contraseña y sesiones de acceso al panel."
      />
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <AccountContent />
      </Suspense>
    </PageContainer>
  );
}
