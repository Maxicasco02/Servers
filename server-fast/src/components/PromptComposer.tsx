import { ArrowRight, Loader2 } from "lucide-react";
import { SERVER_PRESETS, type ServerPreset } from "../lib/serverFiles";
import type { ServerSpecInputs } from "../types/architecture";

interface PromptComposerProps {
  spec: ServerSpecInputs;
  onSpecChange: (next: ServerSpecInputs) => void;
  isGenerating: boolean;
  retryStatus?: string | null;
  error: string | null;
  onSubmit: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function PromptComposer({
  spec,
  onSpecChange,
  isGenerating,
  retryStatus,
  error,
  onSubmit,
  inputRef,
}: PromptComposerProps) {
  const applyPreset = (preset: ServerPreset) => {
    onSpecChange({
      serverName: preset.serverName,
      modality: preset.modality,
      requirements: preset.prompt,
      preferredEngine: preset.preferredEngine || "auto",
      preferredVersion: preset.preferredVersion || "auto",
      maxPlayers: preset.maxPlayers ? String(preset.maxPlayers) : "",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isGenerating) {
      e.preventDefault();
      onSubmit();
    }
  };

  const safeReq = spec?.requirements ?? "";
  const safeName = spec?.serverName ?? "";
  const safeModality = spec?.modality ?? "";

  const hasEnoughInput =
    safeReq.trim().length >= 5 ||
    safeName.trim().length >= 3 ||
    safeModality.trim().length >= 3;

  return (
    <section
      id="architect"
      className="border-b border-[#1E293B] bg-[#0E161F] px-6 py-7"
    >
      <div className="mx-auto max-w-[1160px]">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-100 text-balance">
            Motor de Arquitectura de Servidores de Minecraft
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">
            Completa la ficha técnica de tu servidor. Server Fast traduce los requerimientos a una especificación JSON estricta, asigna la RAM y verifica slugs en Modrinth.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-slate-400">
            Plantillas rápidas:
          </span>
          {SERVER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-md border border-[#1E293B] bg-[#111923] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-[#1E293B] bg-[#111923] p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="spec-server-name"
                className="block text-xs font-medium text-slate-400"
              >
                Nombre / Idea del servidor
              </label>
              <input
                id="spec-server-name"
                type="text"
                value={spec.serverName}
                onChange={(e) =>
                  onSpecChange({ ...spec, serverName: e.target.value })
                }
                placeholder="Ej.: Los Santos Craft RP"
                className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#0B1117] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="spec-modality"
                className="block text-xs font-medium text-slate-400"
              >
                Modalidad principal
              </label>
              <input
                id="spec-modality"
                type="text"
                value={spec.modality}
                onChange={(e) =>
                  onSpecChange({ ...spec, modality: e.target.value })
                }
                placeholder="Ej.: Roleplay, Industrial, RPG, Survival..."
                className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#0B1117] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="spec-max-players"
                className="block text-xs font-medium text-slate-400"
              >
                Capacidad estimada de jugadores
              </label>
              <input
                id="spec-max-players"
                type="number"
                min={2}
                max={500}
                value={spec.maxPlayers}
                onChange={(e) =>
                  onSpecChange({ ...spec, maxPlayers: e.target.value })
                }
                placeholder="Automática (ej. 60)"
                className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#0B1117] px-3 py-2 font-mono text-sm text-slate-100 tabular-nums placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4">
            <label
              htmlFor="server-idea-input"
              className="block text-xs font-medium text-slate-400"
            >
              Requerimientos clave especificados por el cliente
            </label>
            <textarea
              ref={inputRef}
              id="server-idea-input"
              rows={3}
              value={spec.requirements}
              onChange={(e) =>
                onSpecChange({ ...spec, requirements: e.target.value })
              }
              onKeyDown={handleKeyDown}
              placeholder="Describe mods deseados, mecánicas personalizadas (trabajos, economía, misiones), mapa de ciudad, chat de voz por proximidad..."
              className="mt-1.5 w-full resize-y rounded-md border border-[#1E293B] bg-[#0B1117] px-3 py-2.5 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-[#1E293B] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <span className="whitespace-nowrap">Mod Loader preferido</span>
                <select
                  value={spec.preferredEngine}
                  onChange={(e) =>
                    onSpecChange({ ...spec, preferredEngine: e.target.value })
                  }
                  className="rounded-md border border-[#1E293B] bg-[#0B1117] px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="auto">Automático</option>
                  <option value="Forge">Forge</option>
                  <option value="Fabric">Fabric</option>
                  <option value="NeoForge">NeoForge</option>
                  <option value="Paper">Paper (Plugins)</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-400">
                <span className="whitespace-nowrap">Versión deseada</span>
                <select
                  value={spec.preferredVersion}
                  onChange={(e) =>
                    onSpecChange({ ...spec, preferredVersion: e.target.value })
                  }
                  className="rounded-md border border-[#1E293B] bg-[#0B1117] px-2.5 py-1.5 font-mono text-xs font-medium text-slate-200 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="auto">Automática</option>
                  <option value="1.21.1">1.21.1</option>
                  <option value="1.20.1">1.20.1</option>
                  <option value="1.19.2">1.19.2</option>
                  <option value="1.18.2">1.18.2</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              disabled={isGenerating || !hasEnoughInput}
              onClick={onSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Generando arquitectura...</span>
                </>
              ) : (
                <>
                  <span>Generar especificación JSON</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>

        {retryStatus && (
          <div
            role="status"
            className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-200"
          >
            {retryStatus}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
