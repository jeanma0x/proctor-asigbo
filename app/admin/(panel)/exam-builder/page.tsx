import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import ExamBuilder from "@/components/admin/ExamBuilder";
import { PageContainer, PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = {
  title: "Constructor de exámenes · ASIGBO Proctoring",
  description: "Crea exámenes de beca manualmente o mediante carga masiva CSV.",
};

export default function ExamBuilderPage() {
  return (
    <PageContainer>
      <PageHeader
        icon={ClipboardList}
        eyebrow="Gestión"
        title="Constructor de exámenes"
        description="Configura el examen y agrega preguntas manualmente o por carga masiva CSV."
      />
      <ExamBuilder />
    </PageContainer>
  );
}
