import { Plus, Trash2 } from "lucide-react";
import type { SavedArchitecture } from "../types/architecture";

interface HistorySidebarProps {
  items: SavedArchitecture[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export function HistorySidebar({
  items,
  selectedId,
  onSelect,
  onDelete,
  onNew,
}: HistorySidebarProps) {
  return (
    <aside className="w-full lg:w-[272px] shrink-0 border-b lg:border-b-0 lg:border-r border-[#1E293B] bg-[#0D141C]">
      <div className="flex items-center justify-between border-b border-[#1E293B] px-5 py-4">
        <h2 className="text-xs font-semibold tracking-wide text-slate-300">
          Arquitecturas guardadas
        </h2>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#1E293B] bg-[#111923] px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-700 hover:bg-[#16202C] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Nueva</span>
        </button>
      </div>

      <div className="max-h-[260px] lg:max-h-[calc(100vh-140px)] overflow-y-auto divide-y divide-[#1E293B]/70">
        {items.length === 0 ? (
          <div className="px-5 py-8 text-xs leading-relaxed text-slate-500">
            Tus configuraciones generadas aparecerán aquí para comparar motores, RAM y mods en cualquier momento.
          </div>
        ) : (
          items.map((item) => {
            const isSelected = item.id === selectedId;
            const { project_meta, server_properties } = item.architecture;
            return (
              <div
                key={item.id}
                className={`group flex items-start justify-between gap-2 px-5 py-3.5 transition-colors ${
                  isSelected
                    ? "bg-[#15202B] text-slate-100"
                    : "text-slate-300 hover:bg-[#111923]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="min-w-0 flex-1 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500"
                >
                  <p className="truncate text-sm font-medium text-slate-100">
                    {project_meta.server_name}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 font-mono tabular-nums truncate">
                    <span>{project_meta.engine}</span>
                    <span aria-hidden="true">·</span>
                    <span>{project_meta.mc_version}</span>
                    <span aria-hidden="true">·</span>
                    <span>{project_meta.allocated_ram_gb} GB</span>
                    <span aria-hidden="true">·</span>
                    <span>{server_properties.max_players}p</span>
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  aria-label={`Eliminar ${project_meta.server_name}`}
                  className="mt-0.5 rounded p-1 text-slate-500 opacity-70 transition-colors hover:bg-red-500/10 hover:text-red-400 hover:opacity-100 shrink-0 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
