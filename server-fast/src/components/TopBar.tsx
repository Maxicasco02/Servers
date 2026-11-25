import { Download } from "lucide-react";

interface TopBarProps {
  activeSection: "architect" | "dependencies" | "json" | "ram-spec";
  onNavigate: (section: "architect" | "dependencies" | "json" | "ram-spec") => void;
  hasArchitecture: boolean;
  onExportJson: () => void;
}

export function TopBar({
  activeSection,
  onNavigate,
  hasArchitecture,
  onExportJson,
}: TopBarProps) {
  const navItems: Array<{
    id: "architect" | "dependencies" | "json" | "ram-spec";
    label: string;
  }> = [
    { id: "architect", label: "Arquitecto" },
    { id: "dependencies", label: "Compatibilidad" },
    { id: "json", label: "JSON Estricto" },
    { id: "ram-spec", label: "Reglas RAM" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-[#1E293B] bg-[#0B1117]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-6">
        <a
          href="#architect"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("architect");
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500"
        >
          Server Fast
        </a>

        <nav
          aria-label="Navegación principal"
          className="hidden md:flex items-center gap-7"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 border-b focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500 ${
                  isActive
                    ? "border-emerald-500 text-slate-100"
                    : "border-transparent text-slate-400 hover:text-slate-100"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onExportJson}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{hasArchitecture ? "Exportar JSON" : "Nueva Config"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
