import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import AdminSidebar from "@/components/admin/AdminSidebar";
import ChangePasswordForm from "@/components/admin/ChangePasswordForm";
import { PageContainer, PageHeader } from "@/components/admin/ui";
import { getAdmin } from "@/lib/require-admin";

/**
 * Valida la sesión contra la BD en cada petición (el proxy solo ve la cookie). Si el JWT fue
 * invalidado (cambio de contraseña, cierre global, usuario eliminado) vuelve al login.
 * Un usuario con contraseña temporal solo ve la pantalla de cambio obligatorio.
 */
export default async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login?expired=1");

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 md:flex-row">
      <AdminSidebar user={{ name: admin.name, email: admin.email }} />
      <div className="min-w-0 flex-1">
        {admin.mustChangePassword ? (
          <PageContainer>
            <PageHeader
              icon={ShieldAlert}
              eyebrow="Seguridad"
              title="Define tu contraseña"
              description="Tu contraseña es temporal. Elige una nueva para continuar al panel."
            />
            <ChangePasswordForm forced />
          </PageContainer>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
