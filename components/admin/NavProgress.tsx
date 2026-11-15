"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Barra de progreso fina en la parte superior: aparece al hacer clic en un enlace interno y termina al cambiar la ruta. */
export default function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pct, setPct] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const first = useRef(true);

  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search) || url.pathname.includes("/reports/")) return;
      stop();
      setPct(8);
      timer.current = setInterval(() => setPct((p) => (p < 85 ? p + (90 - p) * 0.12 : p)), 200);
    };
    document.addEventListener("click", onClick);
    return () => { document.removeEventListener("click", onClick); stop(); };
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    stop();
    const t1 = setTimeout(() => setPct(100), 0);
    const t2 = setTimeout(() => setPct(0), 350);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pathname, search]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5" role="progressbar" aria-label="Cargando página" aria-hidden={pct === 0} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-asigbo-orange transition-[width,opacity] duration-200 motion-reduce:transition-none" style={{ width: `${pct}%`, opacity: pct === 0 ? 0 : 1 }} />
    </div>
  );
}
