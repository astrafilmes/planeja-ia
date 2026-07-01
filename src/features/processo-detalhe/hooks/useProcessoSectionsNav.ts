import { useEffect, useMemo, useState } from "react";

export function useProcessoSectionsNav(processoId: string | undefined) {
  const SECTIONS = useMemo(
    () => [
      { id: "dados-administrativos", label: "Dados administrativos" },
      { id: "metadados", label: "Metadados" },
    ],
    [],
  );
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveSection(visible.target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [processoId, SECTIONS]);

  return { SECTIONS, activeSection };
}
