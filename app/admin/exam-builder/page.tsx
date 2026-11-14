import type { Metadata } from "next";
import ExamBuilder from "@/components/admin/ExamBuilder";

export const metadata: Metadata = {
  title: "Exam Builder · ASIGBO Proctoring",
  description: "Crea exámenes de beca manualmente o mediante carga masiva CSV.",
};

export default function ExamBuilderPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <ExamBuilder />
    </main>
  );
}
