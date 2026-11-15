import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import CandidateProfileView from "@/components/admin/CandidateProfileView";
import Gate from "@/components/admin/Gate";
import { PageContainer } from "@/components/admin/ui";
import { getCandidateProfile } from "@/actions/candidates";
import { getAdmin } from "@/lib/require-admin";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Perfil de candidato · ASIGBO Proctoring" };

async function Profile({ params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const [p, admin] = await Promise.all([getCandidateProfile(candidateId), getAdmin()]);
  if (!p || !admin) notFound();
  return (
    <CandidateProfileView
      meId={admin.id}
      isSuper={admin.role === "SUPERADMIN"}
      canDecide={can(admin.role, "ranking:decide")}
      canGrade={can(admin.role, "results:grade")}
      canEdit={can(admin.role, "candidates:edit")}
      canExport={can(admin.role, "results:export")}
      p={{
        ...p,
        createdAt: p.createdAt.toISOString(),
        sessions: p.sessions.map((s) => ({ ...s, startedAt: s.startedAt?.toISOString() ?? null, submittedAt: s.submittedAt?.toISOString() ?? null })),
        notes: p.notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
      }}
    />
  );
}

export default function CandidateProfilePage(props: { params: Promise<{ candidateId: string }> }) {
  return (
    <PageContainer>
      <Link href="/admin/candidates" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-asigbo-blue hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a candidatos
      </Link>
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
        <Gate permission="results:view"><Profile {...props} /></Gate>
      </Suspense>
    </PageContainer>
  );
}
