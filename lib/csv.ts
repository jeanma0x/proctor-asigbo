/** Celda CSV segura: escapa comillas y neutraliza fórmulas (=, +, -, @) que Excel ejecutaría al abrir el archivo. */
export const csvCell = (v: string | number | null | undefined) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
export const csvRow = (cells: (string | number | null | undefined)[]) => cells.map(csvCell).join(",");
export const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60) || "informe";
