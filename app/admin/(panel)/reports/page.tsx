import { redirect } from "next/navigation";

/** Reportes se integró en «Resultados e informes» (menos pasos para lo mismo). */
export default function ReportsPage() {
  redirect("/admin/results");
}
