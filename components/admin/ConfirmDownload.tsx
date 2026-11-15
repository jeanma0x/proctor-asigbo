"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

/** Botón de descarga que pide confirmación: los informes contienen datos personales y cada descarga queda en la bitácora. */
export default function ConfirmDownload({
  href, className, label, what, children,
}: { href: string; className: string; label?: string; what: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label={label}>{children}</button>
      <ConfirmDialog
        open={open}
        title={`¿Generar ${what}?`}
        description="Contiene datos personales de los aspirantes (en su mayoría menores de edad). Úsalo solo para fines del proceso de becas; la descarga queda registrada en la bitácora con tu nombre."
        confirmLabel="Sí, generar"
        onCancel={() => setOpen(false)}
        onConfirm={() => { setOpen(false); window.location.assign(href); }}
      />
    </>
  );
}
