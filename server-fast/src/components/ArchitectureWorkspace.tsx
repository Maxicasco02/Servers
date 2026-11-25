import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  Check,
  Copy,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import type {
  ArchitectureBundle,
  ModCategory,
  ModDependency,
  ModSource,
  ModVerificationResult,
  ServerArchitecture,
} from "../types/architecture";
import {
  downloadTextFile,
  generateKubeJsStub,
  generateServerPropertiesText,
  generateStartScriptText,
} from "../lib/serverFiles";

interface ArchitectureWorkspaceProps {
  bundle: ArchitectureBundle | null;
  isGenerating: boolean;
  isVerifying: boolean;
  activeTab: "dependencies" | "json" | "deploy";
  onTabChange: (tab: "dependencies" | "json" | "deploy") => void;
  onVerifyArchitecture: (updated: ServerArchitecture) => Promise<void>;
  onLoadSample: () => void;
  onProvisionServer?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core / Librería",
  vehicle: "Vehículos",
  voice: "Voz proximidad",
  economy: "Economía",
  world: "Mundo / Mapa",
  utility: "Utilidad / TPS",
};

function formatCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function formatDownloads(num?: number): string {
  if (typeof num !== "number") return "—";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}K`;
  return String(num);
}

function VerificationCell({ info }: { info?: ModVerificationResult }) {
  if (!info) {
    return (
      <span className="text-xs text-slate-400">Pendiente de verificar</span>
    );
  }

  switch (info.status) {
    case "verified":
      return (
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Compatible
            {info.matched_version_number
              ? ` (${info.matched_version_number})`
              : ""}
          </span>
        </div>
      );
    case "incompatible":
      return (
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span title={info.message}>Sin build exacto en Modrinth</span>
        </div>
      );
    case "not_found":
      return (
        <div className="flex items-center gap-1.5 text-xs font-medium text-red-400">
          <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Slug no encontrado</span>
        </div>
      );
    case "curseforge_manual":
      return (
        <span className="text-xs text-slate-300">
          CurseForge (verificación externa)
        </span>
      );
    default:
      return (
        <span className="text-xs text-slate-400">{info.message}</span>
      );
  }
}

export function ArchitectureWorkspace({
  bundle,
  isGenerating,
  isVerifying,
  activeTab,
  onTabChange,
  onVerifyArchitecture,
  onLoadSample,
  onProvisionServer,
}: ArchitectureWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [deployFile, setDeployFile] = useState<"properties" | "start" | "kubejs">(
    "properties"
  );

  // Inline mod addition state
  const [newSlug, setNewSlug] = useState("");
  const [newSource, setNewSource] = useState<ModSource>("modrinth");
  const [newCategory, setNewCategory] = useState<ModCategory>("utility");

  useEffect(() => {
    if (bundle) {
      setJsonDraft(JSON.stringify(bundle.architecture, null, 2));
      setJsonError(null);
    }
  }, [bundle]);

  const verificationMap = useMemo(() => {
    const map = new Map<string, ModVerificationResult>();
    if (!bundle) return map;
    for (const v of bundle.verifications) {
      map.set(`${v.source}:${v.slug}`, v);
    }
    return map;
  }, [bundle]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>(Object.keys(CATEGORY_LABELS));
    if (bundle) {
      for (const mod of bundle.architecture.dependencies.mods) {
        if (mod.category) set.add(mod.category);
      }
    }
    return Array.from(set);
  }, [bundle]);

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Clipboard blocked in sandboxed iframe fallback
    }
  };

  if (isGenerating) {
    return (
      <div className="mx-auto max-w-[1160px] px-6 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-7 w-72 rounded bg-[#16202C]" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-24 rounded-xl border border-[#1E293B] bg-[#111923]"
              />
            ))}
          </div>
          <div className="h-64 rounded-xl border border-[#1E293B] bg-[#111923]" />
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="mx-auto max-w-[1160px] px-6 py-10">
        <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-lg font-semibold text-slate-100">
              Listo para diseñar la arquitectura de tu servidor
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Ingresa una descripción en el panel superior o carga un escenario de ejemplo para generar el manifiesto técnico, validar slugs en Modrinth y obtener el cálculo de memoria.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onLoadSample}
                className="inline-flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#16202C] px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-slate-600 cursor-pointer"
              >
                Cargar ejemplo GTA V RP (60 jugadores)
              </button>
            </div>
          </div>

          <div
            id="ram-spec"
            className="mt-8 border-t border-[#1E293B] pt-7"
          >
            <h3 className="text-sm font-semibold text-slate-200">
              Reglas deterministas de asignación de RAM (4 GB – 32 GB)
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-[#1E293B] bg-[#0D141C] p-4">
                <p className="text-xs text-slate-400">Base inicial</p>
                <p className="mt-1 font-mono text-xl font-semibold text-slate-100 tabular-nums">
                  4 GB
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Mínimo garantizado por instancia
                </p>
              </div>
              <div className="rounded-lg border border-[#1E293B] bg-[#0D141C] p-4">
                <p className="text-xs text-slate-400">Escala por jugadores</p>
                <p className="mt-1 font-mono text-xl font-semibold text-slate-100 tabular-nums">
                  +2 GB
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Cada bloque de 25 sobre los primeros 10
                </p>
              </div>
              <div className="rounded-lg border border-[#1E293B] bg-[#0D141C] p-4">
                <p className="text-xs text-slate-400">RP, vehículos o voz</p>
                <p className="mt-1 font-mono text-xl font-semibold text-slate-100 tabular-nums">
                  +4 GB
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Vehículos, mapas de ciudad o chat de voz
                </p>
              </div>
              <div className="rounded-lg border border-[#1E293B] bg-[#0D141C] p-4">
                <p className="text-xs text-slate-400">Técnico / Industrial</p>
                <p className="mt-1 font-mono text-xl font-semibold text-slate-100 tabular-nums">
                  +2 GB
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Create, Mekanism o AE2 (+0 GB en vanilla)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { architecture, ram_breakdown } = bundle;
  const { project_meta, dependencies, server_properties, custom_scripts } =
    architecture;

  const filteredMods = dependencies.mods.filter((mod) => {
    const matchesQuery =
      !searchQuery.trim() ||
      mod.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat =
      categoryFilter === "all" || mod.category === categoryFilter;
    return matchesQuery && matchesCat;
  });

  const verifiedCount = bundle.verifications.filter(
    (v) => v.status === "verified"
  ).length;
  const warningCount = bundle.verifications.filter(
    (v) => v.status === "incompatible" || v.status === "not_found"
  ).length;

  const strictJsonString = JSON.stringify(architecture, null, 2);

  const handleApplyJsonEdit = async () => {
    try {
      const parsed = JSON.parse(jsonDraft) as ServerArchitecture;
      const validEngines = ["Forge", "Fabric", "NeoForge", "Paper"];
      const validGamemodes = ["survival", "creative", "adventure"];
      const validSources = ["modrinth", "curseforge"];

      if (
        !parsed.project_meta ||
        !parsed.dependencies ||
        !parsed.server_properties ||
        !parsed.custom_scripts
      ) {
        setJsonError(
          "Faltan bloques obligatorios (project_meta, dependencies, server_properties o custom_scripts)."
        );
        return;
      }
      if (
        typeof parsed.project_meta.server_name !== "string" ||
        !validEngines.includes(parsed.project_meta.engine) ||
        typeof parsed.project_meta.mc_version !== "string" ||
        !Number.isInteger(parsed.project_meta.allocated_ram_gb)
      ) {
        setJsonError(
          "project_meta inválido: revisa server_name, engine (Forge|Fabric|NeoForge|Paper), mc_version y allocated_ram_gb entero."
        );
        return;
      }
      if (
        !Array.isArray(parsed.dependencies.mods) ||
        !Array.isArray(parsed.dependencies.plugins) ||
        parsed.dependencies.mods.some(
          (m) =>
            typeof m.slug !== "string" ||
            !validSources.includes(m.source) ||
            typeof m.category !== "string"
        )
      ) {
        setJsonError(
          "dependencies inválido: cada mod requiere slug, source (modrinth|curseforge) y category."
        );
        return;
      }
      if (
        !validGamemodes.includes(parsed.server_properties.gamemode) ||
        typeof parsed.server_properties.pvp !== "boolean" ||
        !Number.isInteger(parsed.server_properties.max_players) ||
        typeof parsed.server_properties.online_mode !== "boolean" ||
        !Number.isInteger(parsed.server_properties.view_distance)
      ) {
        setJsonError(
          "server_properties inválido: revisa gamemode, pvp, max_players, online_mode y view_distance."
        );
        return;
      }
      if (
        typeof parsed.custom_scripts.kubejs_required !== "boolean" ||
        typeof parsed.custom_scripts.script_intent !== "string"
      ) {
        setJsonError(
          "custom_scripts inválido: kubejs_required debe ser boolean y script_intent string."
        );
        return;
      }
      setJsonError(null);
      const strictParsed: ServerArchitecture = {
        project_meta: {
          server_name: parsed.project_meta.server_name,
          engine: parsed.project_meta.engine,
          mc_version: parsed.project_meta.mc_version,
          allocated_ram_gb: parsed.project_meta.allocated_ram_gb,
        },
        dependencies: {
          mods: parsed.dependencies.mods,
          plugins: parsed.dependencies.plugins,
        },
        server_properties: {
          gamemode: parsed.server_properties.gamemode,
          pvp: parsed.server_properties.pvp,
          max_players: parsed.server_properties.max_players,
          online_mode: parsed.server_properties.online_mode,
          view_distance: parsed.server_properties.view_distance,
        },
        custom_scripts: {
          kubejs_required: parsed.custom_scripts.kubejs_required,
          script_intent: parsed.custom_scripts.script_intent,
        },
      };
      await onVerifyArchitecture(strictParsed);
    } catch (e) {
      setJsonError(
        e instanceof Error ? `JSON inválido: ${e.message}` : "JSON inválido."
      );
    }
  };

  const handleAddMod = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newSlug.trim().toLowerCase();
    if (!cleaned) return;
    if (dependencies.mods.some((m) => m.slug === cleaned)) return;

    const nextMod: ModDependency = {
      slug: cleaned,
      source: newSource,
      category: newCategory,
    };
    const updated: ServerArchitecture = {
      ...architecture,
      dependencies: {
        ...dependencies,
        mods: [...dependencies.mods, nextMod],
      },
    };
    setNewSlug("");
    await onVerifyArchitecture(updated);
  };

  const handleRemoveMod = async (slugToRemove: string) => {
    const updated: ServerArchitecture = {
      ...architecture,
      dependencies: {
        ...dependencies,
        mods: dependencies.mods.filter((m) => m.slug !== slugToRemove),
      },
    };
    await onVerifyArchitecture(updated);
  };

  const deployPreviewText =
    deployFile === "properties"
      ? generateServerPropertiesText(architecture)
      : deployFile === "start"
        ? generateStartScriptText(architecture)
        : generateKubeJsStub(architecture);

  const deployFilename =
    deployFile === "properties"
      ? "server.properties"
      : deployFile === "start"
        ? "start.sh"
        : "server_fast.js";

  return (
    <div className="mx-auto max-w-[1160px] px-6 py-7 space-y-6">
      {bundle.isFallback && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-950/25 px-4 py-3 text-xs leading-relaxed text-amber-200"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
            aria-hidden="true"
          />
          <div>
            <span className="font-semibold">Modo de respaldo local activo: </span>
            <span>
              {bundle.fallbackReason ||
                "La API no estuvo disponible tras los reintentos; se generó la configuración localmente aplicando las reglas de RAM y mods compatibles."}
            </span>
          </div>
        </div>
      )}

      {/* Architecture title + unboxed metadata */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            {project_meta.server_name}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span>{project_meta.engine}</span>
            <span aria-hidden="true">·</span>
            <span>Minecraft {project_meta.mc_version}</span>
            <span aria-hidden="true">·</span>
            <span>{server_properties.max_players} jugadores máx.</span>
            <span aria-hidden="true">·</span>
            <span>{server_properties.gamemode}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onProvisionServer && (
            <button
              type="button"
              onClick={onProvisionServer}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Aprovisionar Servidor</span>
            </button>
          )}
          <button
            type="button"
            disabled={isVerifying}
            onClick={() => onVerifyArchitecture(architecture)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#111923] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isVerifying ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>{isVerifying ? "Verificando..." : "Reverificar Modrinth"}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                `${project_meta.server_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`,
                strictJsonString
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#111923] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Descargar JSON</span>
          </button>
        </div>
      </div>

      {/* 4-Column Metric Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-4">
          <p className="text-xs font-medium text-slate-400">Motor y Versión</p>
          <p className="mt-1.5 font-mono text-lg font-semibold text-slate-100 tabular-nums">
            {project_meta.engine} · {project_meta.mc_version}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Distancia de visión: {server_properties.view_distance} chunks
          </p>
        </div>

        <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-4">
          <p className="text-xs font-medium text-slate-400">RAM Asignada</p>
          <p className="mt-1.5 font-mono text-lg font-semibold text-emerald-400 tabular-nums">
            {project_meta.allocated_ram_gb} GB
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
            {ram_breakdown.base_gb} base + {ram_breakdown.players_gb} jug. +{" "}
            {ram_breakdown.complexity_gb} mods
          </p>
        </div>

        <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-4">
          <p className="text-xs font-medium text-slate-400">Dependencias</p>
          <p className="mt-1.5 font-mono text-lg font-semibold text-slate-100 tabular-nums">
            {project_meta.engine === "Paper"
              ? `${dependencies.plugins.length} plugins`
              : `${dependencies.mods.length} mods`}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {project_meta.engine === "Paper"
              ? "Sin mods de cliente requeridos"
              : `${verifiedCount} verificados · ${warningCount} alertas`}
          </p>
        </div>

        <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-4">
          <p className="text-xs font-medium text-slate-400">Lógica KubeJS</p>
          <p className="mt-1.5 font-display text-lg font-semibold text-slate-100">
            {custom_scripts.kubejs_required ? "Requerido" : "No requerido"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {custom_scripts.kubejs_required
              ? "Incluye especificación de eventos"
              : "Cubierto por mods estándar"}
          </p>
        </div>
      </div>

      {/* Segmented Workspace Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E293B] pb-3">
        <div
          role="tablist"
          aria-label="Vistas de arquitectura"
          className="inline-flex items-center gap-1 rounded-lg border border-[#1E293B] bg-[#0D141C] p-1"
        >
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === "dependencies"}
            onClick={() => onTabChange("dependencies")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "dependencies"
                ? "bg-[#1A2430] text-slate-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Dependencias y Parámetros
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === "json"}
            onClick={() => onTabChange("json")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "json"
                ? "bg-[#1A2430] text-slate-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            JSON Estricto
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === "deploy"}
            onClick={() => onTabChange("deploy")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "deploy"
                ? "bg-[#1A2430] text-slate-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Archivos de Despliegue
          </button>
        </div>
      </div>

      {/* TAB 1: Dependencies + RAM + server.properties + KubeJS */}
      {activeTab === "dependencies" && (
        <div id="dependencies" className="space-y-6">
          {project_meta.engine !== "Paper" ? (
            <div className="rounded-xl border border-[#1E293B] bg-[#111923]">
              <div className="flex flex-col gap-3 border-b border-[#1E293B] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Matriz de Mods ({dependencies.mods.length})
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Verificación en vivo contra Modrinth v2 para {project_meta.engine}{" "}
                    {project_meta.mc_version}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filtrar slug..."
                      aria-label="Filtrar mods por slug"
                      className="w-40 rounded-md border border-[#1E293B] bg-[#0B1117] py-1.5 pl-8 pr-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    aria-label="Filtrar por categoría"
                    className="rounded-md border border-[#1E293B] bg-[#0B1117] px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="all">Todas las categorías</option>
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {formatCategoryLabel(cat)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#1E293B] bg-[#0D141C] text-xs font-medium text-slate-400">
                      <th className="px-5 py-3">Proyecto / Slug</th>
                      <th className="px-4 py-3">Categoría</th>
                      <th className="px-4 py-3">Fuente</th>
                      <th className="px-4 py-3">Compatibilidad</th>
                      <th className="px-4 py-3 text-right">Descargas</th>
                      <th className="px-5 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]/70">
                    {filteredMods.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-5 py-8 text-center text-xs text-slate-500"
                        >
                          No hay mods que coincidan con el filtro actual.
                        </td>
                      </tr>
                    ) : (
                      filteredMods.map((mod) => {
                        const info = verificationMap.get(
                          `${mod.source}:${mod.slug}`
                        );
                        return (
                          <tr
                            key={`${mod.source}-${mod.slug}`}
                            className="transition-colors hover:bg-[#151F2B]"
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                {info?.icon_url ? (
                                  <img
                                    src={info.icon_url}
                                    alt={info.title || mod.slug}
                                    referrerPolicy="no-referrer"
                                    className="h-7 w-7 rounded-md border border-[#1E293B] bg-[#0B1117] object-cover shrink-0"
                                  />
                                ) : (
                                  <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#1E293B] bg-[#0D141C] text-slate-400 shrink-0">
                                    <Box className="h-3.5 w-3.5" aria-hidden="true" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-slate-100 truncate">
                                    {info?.title || mod.slug}
                                  </div>
                                  <div className="font-mono text-[11px] text-slate-400 truncate">
                                    {mod.slug}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">
                              {formatCategoryLabel(mod.category)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">
                              {mod.source}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <VerificationCell info={info} />
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-slate-300 tabular-nums whitespace-nowrap">
                              {formatDownloads(info?.downloads)}
                            </td>
                            <td className="px-5 py-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                {info?.project_url && (
                                  <a
                                    href={info.project_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Abrir ${mod.slug} en ${mod.source}`}
                                    className="rounded p-1 text-slate-400 transition-colors hover:bg-[#1E293B] hover:text-slate-100"
                                  >
                                    <ExternalLink
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMod(mod.slug)}
                                  aria-label={`Quitar ${mod.slug}`}
                                  className="rounded p-1 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add custom mod row */}
              <form
                onSubmit={handleAddMod}
                className="flex flex-wrap items-center gap-2.5 border-t border-[#1E293B] bg-[#0D141C] px-5 py-3.5"
              >
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="Agregar slug (ej. sodium, waystones)..."
                  className="min-w-[200px] flex-1 rounded-md border border-[#1E293B] bg-[#0B1117] px-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                />
                <select
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value as ModSource)}
                  aria-label="Fuente del nuevo mod"
                  className="rounded-md border border-[#1E293B] bg-[#0B1117] px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="modrinth">modrinth</option>
                  <option value="curseforge">curseforge</option>
                </select>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as ModCategory)}
                  aria-label="Categoría del nuevo mod"
                  className="rounded-md border border-[#1E293B] bg-[#0B1117] px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                >
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!newSlug.trim() || isVerifying}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#1E293B] bg-[#16202C] px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:border-slate-600 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Agregar y verificar</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-5">
              <h3 className="text-sm font-semibold text-slate-100">
                Plugins de Paper ({dependencies.plugins.length})
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Los clientes pueden conectarse sin instalar mods adicionales.
              </p>
              <div className="mt-4 divide-y divide-[#1E293B]/70 border-t border-[#1E293B]">
                {dependencies.plugins.map((plugin) => (
                  <div
                    key={plugin}
                    className="flex items-center justify-between py-2.5 text-xs"
                  >
                    <span className="font-mono font-medium text-slate-200">
                      {plugin}
                    </span>
                    <span className="text-slate-400">
                      Paper {project_meta.mc_version}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Side-by-side: RAM Breakdown + Server Properties */}
          <div id="ram-spec" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-5">
              <h3 className="text-sm font-semibold text-slate-100">
                Desglose de asignación de RAM
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Cálculo determinista aplicado sobre límites de seguridad (4 GB – 32 GB)
              </p>
              <dl className="mt-4 divide-y divide-[#1E293B]/70 text-xs">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-slate-400">Base inicial</dt>
                  <dd className="font-mono font-medium text-slate-200 tabular-nums">
                    {ram_breakdown.base_gb} GB
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-slate-400">
                    Capacidad ({server_properties.max_players} jugadores)
                  </dt>
                  <dd className="font-mono font-medium text-slate-200 tabular-nums">
                    +{ram_breakdown.players_gb} GB
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-slate-400">
                    {ram_breakdown.complexity_label}
                  </dt>
                  <dd className="font-mono font-medium text-slate-200 tabular-nums shrink-0">
                    +{ram_breakdown.complexity_gb} GB
                  </dd>
                </div>
                <div className="flex items-center justify-between pt-3 font-semibold">
                  <dt className="text-slate-100">Total asignado</dt>
                  <dd className="font-mono text-sm text-emerald-400 tabular-nums">
                    {ram_breakdown.total_gb} GB
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-5">
              <h3 className="text-sm font-semibold text-slate-100">
                Parámetros de server.properties
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Configuración de red, modo de juego y distancia de chunks
              </p>
              <dl className="mt-4 divide-y divide-[#1E293B]/70 text-xs">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="font-mono text-slate-400">gamemode</dt>
                  <dd className="font-mono font-medium text-slate-200">
                    {server_properties.gamemode}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="font-mono text-slate-400">pvp</dt>
                  <dd className="font-mono font-medium text-slate-200">
                    {String(server_properties.pvp)}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="font-mono text-slate-400">max-players</dt>
                  <dd className="font-mono font-medium text-slate-200 tabular-nums">
                    {server_properties.max_players}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="font-mono text-slate-400">online-mode</dt>
                  <dd className="font-mono font-medium text-slate-200">
                    {String(server_properties.online_mode)}
                  </dd>
                </div>
                <div className="flex items-center justify-between pt-2.5">
                  <dt className="font-mono text-slate-400">view-distance</dt>
                  <dd className="font-mono font-medium text-slate-200 tabular-nums">
                    {server_properties.view_distance}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* KubeJS Logic Panel */}
          <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                Especificación de Scripting (KubeJS)
              </h3>
              <span
                className={`text-xs font-medium ${
                  custom_scripts.kubejs_required
                    ? "text-amber-400"
                    : "text-slate-400"
                }`}
              >
                {custom_scripts.kubejs_required
                  ? "KubeJS requerido"
                  : "KubeJS no necesario"}
              </span>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-300">
              {custom_scripts.script_intent ||
                "Todas las mecánicas están cubiertas nativamente por las dependencias seleccionadas."}
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: Strict JSON Inspector & Live Validator */}
      {activeTab === "json" && (
        <div id="json" className="rounded-xl border border-[#1E293B] bg-[#111923]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] px-5 py-3.5">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Salida JSON Estricta (Esquema Server Fast)
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Puedes editar manualmente el JSON y revalidar RAM y Modrinth en vivo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isVerifying}
                onClick={handleApplyJsonEdit}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#1E293B] bg-[#16202C] px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:border-slate-600 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isVerifying ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                <span>Aplicar y verificar</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopy("json", jsonDraft)}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedKey === "json" ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copiar JSON</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[#1E293B] bg-[#0D141C] px-5 py-2.5 text-xs text-slate-400 font-mono tabular-nums">
            <span>
              Esquema: project_meta · dependencies · server_properties · custom_scripts
            </span>
            <span aria-hidden="true">·</span>
            <span>
              RAM: {ram_breakdown.base_gb} GB base + {ram_breakdown.players_gb} GB jug. +{" "}
              {ram_breakdown.complexity_gb} GB mods = {ram_breakdown.total_gb} GB
            </span>
            {project_meta.engine !== "Paper" && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Modrinth {project_meta.mc_version}: {verifiedCount}/
                  {dependencies.mods.length} verificados
                </span>
              </>
            )}
          </div>

          {jsonError && (
            <div className="border-b border-red-500/30 bg-red-950/30 px-5 py-2.5 text-xs text-red-200">
              {jsonError}
            </div>
          )}

          <div className="p-4">
            <label htmlFor="strict-json-editor" className="sr-only">
              Editor JSON estricto
            </label>
            <textarea
              id="strict-json-editor"
              value={jsonDraft}
              onChange={(e) => setJsonDraft(e.target.value)}
              spellCheck={false}
              rows={24}
              className="w-full rounded-lg border border-[#1E293B] bg-[#0B1117] p-4 font-mono text-xs leading-relaxed text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* TAB 3: Ready-to-Deploy Server Files */}
      {activeTab === "deploy" && (
        <div className="rounded-xl border border-[#1E293B] bg-[#111923]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] px-5 py-3.5">
            <div className="inline-flex items-center gap-1 rounded-lg border border-[#1E293B] bg-[#0D141C] p-1">
              <button
                type="button"
                onClick={() => setDeployFile("properties")}
                className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  deployFile === "properties"
                    ? "bg-[#1A2430] text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                server.properties
              </button>
              <button
                type="button"
                onClick={() => setDeployFile("start")}
                className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  deployFile === "start"
                    ? "bg-[#1A2430] text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                start.sh ({project_meta.allocated_ram_gb}G)
              </button>
              <button
                type="button"
                onClick={() => setDeployFile("kubejs")}
                className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  deployFile === "kubejs"
                    ? "bg-[#1A2430] text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                server_fast.js
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(deployFilename, deployPreviewText)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#1E293B] bg-[#16202C] px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:border-slate-600 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedKey === deployFilename ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(deployFilename, deployPreviewText)
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Descargar {deployFilename}</span>
              </button>
            </div>
          </div>

          <pre className="overflow-x-auto bg-[#0B1117] p-5 font-mono text-xs leading-relaxed text-slate-200">
            <code>{deployPreviewText}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
