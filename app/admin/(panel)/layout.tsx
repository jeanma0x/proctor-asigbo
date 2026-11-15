import { Suspense } from "react";
import AdminShell from "@/components/admin/AdminShell";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col bg-slate-50 md:flex-row">
          <AdminSidebar user={null} />
          <div className="min-w-0 flex-1" />
        </div>
      }
    >
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
