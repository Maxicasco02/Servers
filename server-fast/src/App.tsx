import { useEffect, useRef, useState } from "react";
import { TopBar } from "./components/TopBar";
import { HistorySidebar } from "./components/HistorySidebar";
import { DeployWizard } from "./components/DeployWizard";
import { PromptComposer } from "./components/PromptComposer";
import { ArchitectureWorkspace } from "./components/ArchitectureWorkspace";
import {
  ProvisioningModal,
  type ProvisioningPreviewMeta,
} from "./components/ProvisioningModal";
import { ActiveServerDashboard } from "./components/ActiveServerDashboard";
import { buildLocalFallbackBundle } from "./lib/localFallback";
import {
  deployProvisionedServer,
  sendServerPowerAction,
  type PlanTierId,
} from "./lib/provisioningService";
import { GUARDIAN_ERROR_KEYWORDS } from "./lib/guardianService";
import { downloadTextFile, SERVER_PRESETS } from "./lib/serverFiles";
import type {
  ArchitectureBundle,
  LogDiagnosticResult,
  ProvisionedServerRecord,
  SavedArchitecture,
  ServerArchitecture,
  ServerSpecInputs,
} from "./types/architecture";

const STORAGE_KEY = "server_fast_history_v1";

const EMPTY_SPEC: ServerSpecInputs = {
  serverName: "",
  modality: "",
  maxPlayers: "",
  requirements: "",
  preferredVersion: "1.20.1",
  preferredEngine: "auto",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripMarkdownAndParseJson(rawText: string): Record<string, unknown> | null {
  try {
    let cleaned = rawText.trim();
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch && fencedMatch[1]) {
      cleaned = fencedMatch[1].trim();
    }

    if (!cleaned) return null;
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isUnavailablePayload(
  statusCode: number,
  data: Record<string, unknown> | null
): boolean {
  if (statusCode === 503) return true;
  if (!data) return false;
  if (data.status === "UNAVAILABLE" || data.code === 503) return true;
  const errStr = typeof data.error === "string" ? data.error : "";
  return /\b503\b|UNAVAILABLE/i.test(errStr);
}

function normalizeBundle(raw: unknown): ArchitectureBundle | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Partial<ArchitectureBundle>;
    const arch = obj.architecture;
    if (!arch || typeof arch !== "object") return null;
    if (!arch.project_meta || !arch.dependencies || !arch.server_properties) {
      return null;
    }

    const maxPlayers = Math.max(
      1,
      Math.round(Number(arch.server_properties.max_players) || 10)
    );
    const ramGb = Math.min(
      32,
      Math.max(4, Math.round(Number(arch.project_meta.allocated_ram_gb) || 4))
    );

    const normalizedArch: ServerArchitecture = {
      project_meta: {
        server_name: String(arch.project_meta.server_name || "Servidor Minecraft"),
        engine: arch.project_meta.engine || "Forge",
        mc_version: String(arch.project_meta.mc_version || "1.20.1"),
        allocated_ram_gb: ramGb,
      },
      dependencies: {
        mods: Array.isArray(arch.dependencies.mods) ? arch.dependencies.mods : [],
        plugins: Array.isArray(arch.dependencies.plugins)
          ? arch.dependencies.plugins
          : [],
      },
      server_properties: {
        gamemode: arch.server_properties.gamemode || "survival",
        pvp: Boolean(arch.server_properties.pvp),
        max_players: maxPlayers,
        online_mode:
          arch.server_properties.online_mode !== undefined
            ? Boolean(arch.server_properties.online_mode)
            : true,
        view_distance: Math.min(
          32,
          Math.max(2, Math.round(Number(arch.server_properties.view_distance) || 8))
        ),
      },
      custom_scripts: {
        kubejs_required: Boolean(arch.custom_scripts?.kubejs_required),
        script_intent: String(arch.custom_scripts?.script_intent || ""),
      },
    };

    const rb = obj.ram_breakdown;
    const ram_breakdown =
      rb && typeof rb === "object"
        ? {
            base_gb: Number(rb.base_gb) || 4,
            players_gb: Number(rb.players_gb) || 0,
            complexity_gb: Number(rb.complexity_gb) || 0,
            complexity_label: String(
              rb.complexity_label || "Cálculo estándar de servidor"
            ),
            total_gb: Number(rb.total_gb) || ramGb,
            clamped: Boolean(rb.clamped),
          }
        : {
            base_gb: 4,
            players_gb: Math.max(0, Math.ceil(Math.max(0, maxPlayers - 10) / 25) * 2),
            complexity_gb: Math.max(
              0,
              ramGb - 4 - Math.max(0, Math.ceil(Math.max(0, maxPlayers - 10) / 25) * 2)
            ),
            complexity_label: "Cálculo estándar de servidor",
            total_gb: ramGb,
            clamped: false,
          };

    return {
      architecture: normalizedArch,
      ram_breakdown,
      verifications: Array.isArray(obj.verifications) ? obj.verifications : [],
      generated_at:
        typeof obj.generated_at === "string"
          ? obj.generated_at
          : new Date().toISOString(),
      isFallback: Boolean(obj.isFallback),
      fallbackReason:
        typeof obj.fallbackReason === "string" ? obj.fallbackReason : undefined,
    };
  } catch {
    return null;
  }
}

function loadHistory(): SavedArchitecture[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: SavedArchitecture[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const normalized = normalizeBundle(item);
      if (!normalized) continue;
      const rec = item as Partial<SavedArchitecture>;
      valid.push({
        ...normalized,
        id:
          typeof rec.id === "string" && rec.id
            ? rec.id
            : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt: typeof rec.prompt === "string" ? rec.prompt : "",
        specInputs: rec.specInputs
          ? { ...EMPTY_SPEC, ...rec.specInputs }
          : undefined,
        provisionedServer:
          rec.provisionedServer &&
          typeof rec.provisionedServer === "object" &&
          typeof rec.provisionedServer.server_id === "string"
            ? rec.provisionedServer
            : undefined,
      });
    }
    return valid;
  } catch {
    return [];
  }
}

export default function App() {
  const [history, setHistory] = useState<SavedArchitecture[]>(() => loadHistory());
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const initial = loadHistory();
    return initial[0]?.id ?? null;
  });

  const [spec, setSpec] = useState<ServerSpecInputs>(EMPTY_SPEC);
  const [isGenerating, setIsGenerating] = useState(false);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [composerMode, setComposerMode] = useState<"wizard" | "advanced">("wizard");
  const [workspaceView, setWorkspaceView] = useState<"dashboard" | "architecture">(
    "dashboard"
  );
  const [activeNav, setActiveNav] = useState<
    "architect" | "dependencies" | "json" | "ram-spec"
  >("architect");
  const [activeTab, setActiveTab] = useState<"dependencies" | "json" | "deploy">(
    "dependencies"
  );

  // Live Provisioning Modal State
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);
  const [modalPlanId, setModalPlanId] = useState<PlanTierId>("pro");
  const [modalPreview, setModalPreview] = useState<ProvisioningPreviewMeta>({
    serverName: "Server Fast",
    engine: "Forge",
    mcVersion: "1.20.1",
    allocatedRamGb: 8,
    totalMods: 7,
  });
  const [modalArchitecture, setModalArchitecture] =
    useState<ServerArchitecture | null>(null);
  const [modalProvisionResult, setModalProvisionResult] =
    useState<ProvisionedServerRecord | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 20)));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  const currentItem =
    history.find((item) => item.id === selectedId) ?? null;

  const generateArchitectureItem = async (
    overrideSpec?: ServerSpecInputs
  ): Promise<SavedArchitecture | null> => {
    const rawSpec = overrideSpec ?? spec;
    const activeSpec: ServerSpecInputs = {
      serverName: String(rawSpec?.serverName ?? ""),
      modality: String(rawSpec?.modality ?? ""),
      maxPlayers: String(rawSpec?.maxPlayers ?? ""),
      requirements: String(rawSpec?.requirements ?? ""),
      preferredVersion: String(rawSpec?.preferredVersion ?? "1.20.1"),
      preferredEngine: String(rawSpec?.preferredEngine ?? "auto"),
    };

    const reqText = activeSpec.requirements.trim();
    const nameText = activeSpec.serverName.trim();
    const modText = activeSpec.modality.trim();

    if (reqText.length < 5 && nameText.length < 3 && modText.length < 3) {
      setError(
        "Ingresa el nombre/idea, modalidad o requerimientos del servidor (mínimo 5 caracteres)."
      );
      return null;
    }

    setError(null);
    setRetryStatus(null);
    setIsGenerating(true);

    try {
      const parsedMaxPlayers = activeSpec.maxPlayers
        ? Number(activeSpec.maxPlayers)
        : undefined;
      const payload = JSON.stringify({
        prompt: reqText,
        serverName: nameText,
        modality: modText,
        preferredEngine: activeSpec.preferredEngine,
        preferredVersion: activeSpec.preferredVersion,
        maxPlayers:
          parsedMaxPlayers && !Number.isNaN(parsedMaxPlayers)
            ? parsedMaxPlayers
            : undefined,
      });

      const maxRetries = 3;
      let bundle: ArchitectureBundle | null = null;
      let fallbackTriggerReason = "";

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch("/api/architecture/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
          });

          const rawBody = await res.text();
          const data = stripMarkdownAndParseJson(rawBody);

          if (res.ok) {
            if (!data) {
              fallbackTriggerReason =
                "No se pudo parsear el JSON devuelto por la API.";
              break;
            }
            const parsedBundle = normalizeBundle(data);
            if (parsedBundle) {
              bundle = { ...parsedBundle, isFallback: false, fallbackReason: undefined };
              break;
            }
            fallbackTriggerReason =
              "El JSON devuelto por la API no cumple la estructura esperada.";
            break;
          }

          if (isUnavailablePayload(res.status, data)) {
            fallbackTriggerReason =
              data && typeof data.error === "string"
                ? data.error
                : "La API respondió con error 503 (UNAVAILABLE).";

            if (data?.retried_upstream === true) {
              break;
            }

            if (attempt < maxRetries) {
              setRetryStatus(
                `API temporalmente no disponible (503). Reintento ${attempt + 1} de ${maxRetries} en 2s...`
              );
              await sleep(2000);
              continue;
            }
            break;
          }

          if (res.status === 502 || data?.code === "INVALID_JSON") {
            fallbackTriggerReason =
              data && typeof data.error === "string"
                ? data.error
                : "Fallo al parsear el JSON de la API.";
            break;
          }

          if (res.status === 400) {
            throw new Error(
              data && typeof data.error === "string"
                ? data.error
                : "Datos de entrada inválidos."
            );
          }

          fallbackTriggerReason =
            data && typeof data.error === "string"
              ? data.error
              : `Error HTTP ${res.status} al consultar la API.`;
          break;
        } catch (fetchErr) {
          const isNetworkErr =
            fetchErr instanceof TypeError ||
            (fetchErr instanceof Error &&
              /network|fetch|503|UNAVAILABLE/i.test(fetchErr.message));
          if (!isNetworkErr) {
            throw fetchErr;
          }
          fallbackTriggerReason =
            "Error de conexión o servicio temporalmente no disponible (503).";
          if (attempt < maxRetries) {
            setRetryStatus(
              `Sin respuesta del servidor. Reintento ${attempt + 1} de ${maxRetries} en 2s...`
            );
            await sleep(2000);
            continue;
          }
        }
      }

      if (!bundle) {
        const fallback = buildLocalFallbackBundle(
          activeSpec,
          `${fallbackTriggerReason || "Fallo al procesar la respuesta de la API."} Se generó una configuración local de respaldo con las reglas de RAM y mods.`
        );
        try {
          const verifyRes = await fetch("/api/architecture/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              architecture: fallback.architecture,
              prompt: `${nameText} ${modText} ${reqText}`.trim(),
            }),
          });
          if (verifyRes.ok) {
            const rawVerifyBody = await verifyRes.text();
            const parsedVerify = stripMarkdownAndParseJson(rawVerifyBody);
            const verifiedBundle = normalizeBundle(parsedVerify);
            bundle = verifiedBundle
              ? {
                  ...verifiedBundle,
                  isFallback: true,
                  fallbackReason: fallback.fallbackReason,
                }
              : fallback;
          } else {
            bundle = fallback;
          }
        } catch {
          bundle = fallback;
        }
      }

      const newItem: SavedArchitecture = {
        ...bundle,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt: `${nameText} ${modText} ${reqText}`.trim(),
        specInputs: { ...activeSpec },
      };

      setHistory((prev) => [newItem, ...prev]);
      setSelectedId(newItem.id);
      setActiveTab((prev) => (prev === "json" ? "json" : "dependencies"));
      return newItem;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error de conexión con el servidor."
      );
      return null;
    } finally {
      setIsGenerating(false);
      setRetryStatus(null);
    }
  };

  const handleGenerate = async (overrideSpec?: ServerSpecInputs) => {
    await generateArchitectureItem(overrideSpec);
    setWorkspaceView("architecture");
  };

  const handleVerifyArchitecture = async (updated: ServerArchitecture) => {
    if (!currentItem) return;
    setError(null);
    setIsVerifying(true);

    try {
      const res = await fetch("/api/architecture/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          architecture: updated,
          prompt: currentItem.prompt,
        }),
      });

      const rawVerifyText = await res.text();
      const data = stripMarkdownAndParseJson(rawVerifyText);
      if (!res.ok) {
        throw new Error(
          (data && typeof data.error === "string" ? data.error : null) ||
            "No se pudo verificar la configuración."
        );
      }

      const verified = normalizeBundle(data);
      if (!verified) {
        throw new Error("Respuesta de verificación inválida.");
      }
      setHistory((prev) =>
        prev.map((item) =>
          item.id === currentItem.id
            ? {
                ...item,
                ...verified,
                isFallback: item.isFallback,
                fallbackReason: item.fallbackReason,
              }
            : item
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al verificar compatibilidad."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSelectHistory = (id: string) => {
    const found = history.find((h) => h.id === id);
    if (!found) return;
    setSelectedId(id);
    if (found.specInputs) {
      setSpec({ ...EMPTY_SPEC, ...found.specInputs });
    } else {
      setSpec({
        ...EMPTY_SPEC,
        serverName: found.architecture.project_meta.server_name,
        requirements: found.prompt || "",
        maxPlayers: String(found.architecture.server_properties.max_players),
        preferredEngine: found.architecture.project_meta.engine,
        preferredVersion: found.architecture.project_meta.mc_version,
      });
    }
    setError(null);
  };

  const handleDeleteHistory = (id: string) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleNewConfig = () => {
    setSelectedId(null);
    setSpec(EMPTY_SPEC);
    setError(null);
    setTimeout(() => promptInputRef.current?.focus(), 50);
  };

  const handleNavigate = (
    section: "architect" | "dependencies" | "json" | "ram-spec"
  ) => {
    setActiveNav(section);
    if (section === "dependencies") {
      setWorkspaceView("architecture");
      setActiveTab("dependencies");
    } else if (section === "json") {
      setWorkspaceView("architecture");
      setActiveTab("json");
    } else if (section === "ram-spec") {
      setWorkspaceView("architecture");
      setActiveTab("dependencies");
    }

    setTimeout(() => {
      const target = document.getElementById(section);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleTopBarAction = () => {
    if (currentItem) {
      const filename = `${currentItem.architecture.project_meta.server_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}.json`;
      downloadTextFile(
        filename,
        JSON.stringify(currentItem.architecture, null, 2)
      );
    } else {
      handleNewConfig();
    }
  };

  const handleLoadSample = () => {
    const gtaPreset = SERVER_PRESETS[0];
    const presetSpec: ServerSpecInputs = {
      serverName: gtaPreset.serverName,
      modality: gtaPreset.modality,
      requirements: gtaPreset.prompt,
      preferredEngine: gtaPreset.preferredEngine || "Forge",
      preferredVersion: gtaPreset.preferredVersion || "1.20.1",
      maxPlayers: String(gtaPreset.maxPlayers || 60),
    };
    setSpec(presetSpec);
    handleGenerate(presetSpec);
  };

  const handleWizardDeploy = (
    wizardSpec: ServerSpecInputs,
    planId: PlanTierId,
    estimatedRamGb: number
  ) => {
    setSpec(wizardSpec);
    setError(null);
    setModalError(null);
    setModalPlanId(planId);
    setModalArchitecture(null);
    setModalProvisionResult(null);

    const previewEngine =
      wizardSpec.preferredEngine === "auto"
        ? "Forge"
        : wizardSpec.preferredEngine || "Forge";
    const approxMods = Math.max(
      4,
      wizardSpec.requirements.split(",").filter((s) => s.trim().length > 0).length + 3
    );

    setModalPreview({
      serverName: wizardSpec.serverName || "Server Fast",
      engine: previewEngine,
      mcVersion: wizardSpec.preferredVersion || "1.20.1",
      allocatedRamGb: estimatedRamGb,
      totalMods: approxMods,
    });
    setIsProvisionModalOpen(true);

    void (async () => {
      try {
        const createdItem = await generateArchitectureItem(wizardSpec);
        if (!createdItem) {
          setModalError(
            "No se pudo generar la especificación técnica del servidor."
          );
          return;
        }
        setModalArchitecture(createdItem.architecture);

        const provisioned = await deployProvisionedServer(
          createdItem.architecture,
          planId
        );
        setHistory((prev) =>
          prev.map((item) =>
            item.id === createdItem.id
              ? { ...item, provisionedServer: provisioned }
              : item
          )
        );
        setModalProvisionResult(provisioned);
      } catch (err) {
        setModalError(
          err instanceof Error
            ? err.message
            : "Error inesperado durante el aprovisionamiento."
        );
      }
    })();
  };

  const handleProvisionExistingArchitecture = () => {
    if (!currentItem) return;
    const arch = currentItem.architecture;
    const inferredPlan: PlanTierId =
      arch.project_meta.allocated_ram_gb > 16 ||
      arch.server_properties.max_players > 60
        ? "enterprise"
        : arch.project_meta.allocated_ram_gb > 6 ||
            arch.project_meta.engine !== "Paper"
          ? "pro"
          : "basic";

    setModalError(null);
    setModalPlanId(inferredPlan);
    setModalArchitecture(arch);
    setModalProvisionResult(null);
    setModalPreview({
      serverName: arch.project_meta.server_name,
      engine: arch.project_meta.engine,
      mcVersion: arch.project_meta.mc_version,
      allocatedRamGb: arch.project_meta.allocated_ram_gb,
      totalMods:
        arch.project_meta.engine === "Paper"
          ? arch.dependencies.plugins.length
          : arch.dependencies.mods.length,
    });
    setIsProvisionModalOpen(true);

    void (async () => {
      try {
        const provisioned = await deployProvisionedServer(arch, inferredPlan);
        setHistory((prev) =>
          prev.map((item) =>
            item.id === currentItem.id
              ? { ...item, provisionedServer: provisioned }
              : item
          )
        );
        setModalProvisionResult(provisioned);
      } catch (err) {
        setModalError(
          err instanceof Error
            ? err.message
            : "Error al aprovisionar el servidor."
        );
      }
    })();
  };

  const handleUpdateProvisionedServer = (
    itemId: string,
    nextServer: ProvisionedServerRecord
  ) => {
    setHistory((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, provisionedServer: nextServer } : item
      )
    );
  };

  const handleApplyGuardianPatch = async (
    itemId: string,
    diagnostic: LogDiagnosticResult
  ) => {
    const target = history.find((item) => item.id === itemId);
    if (!target || !target.provisionedServer) return;

    const offendingSlug = diagnostic.offending_mod_slug?.trim().toLowerCase() || null;
    const nextMods = offendingSlug
      ? target.architecture.dependencies.mods.filter(
          (m) => m.slug.trim().toLowerCase() !== offendingSlug
        )
      : target.architecture.dependencies.mods;

    const nextVerifications = offendingSlug
      ? target.verifications.filter(
          (v) => v.slug.trim().toLowerCase() !== offendingSlug
        )
      : target.verifications;

    const updatedArch: ServerArchitecture = {
      ...target.architecture,
      dependencies: {
        ...target.architecture.dependencies,
        mods: nextMods,
      },
    };

    await sendServerPowerAction(target.provisionedServer.server_id, "restart");

    const nowStr = new Date().toTimeString().slice(0, 8);
    const cleanedPreviousLogs = target.provisionedServer.console_logs.filter(
      (line) =>
        !GUARDIAN_ERROR_KEYWORDS.some((kw) =>
          line.toLowerCase().includes(kw.toLowerCase())
        ) && !/\[.*\/(FATAL|ERROR)\]/.test(line)
    );

    const patchLogs = [
      ...cleanedPreviousLogs.slice(-6),
      offendingSlug
        ? `[${nowStr}] [GuardianAI/INFO]: Parche automático aplicado — mod conflictivo "${offendingSlug}" removido de la Matriz de Mods (${nextMods.length} mods activos).`
        : `[${nowStr}] [GuardianAI/INFO]: Parche automático aplicado — caché de arranque limpiada.`,
      `[${nowStr}] [ServerFast/Daemon]: Reiniciando contenedor de forma segura...`,
    ];

    setHistory((prev) =>
      prev.map((item) =>
        item.id === itemId && item.provisionedServer
          ? {
              ...item,
              architecture: updatedArch,
              verifications: nextVerifications,
              provisionedServer: {
                ...item.provisionedServer,
                status: "restarting",
                console_logs: patchLogs,
              },
            }
          : item
      )
    );

    window.setTimeout(() => {
      const doneTime = new Date().toTimeString().slice(0, 8);
      setHistory((prev) =>
        prev.map((item) =>
          item.id === itemId && item.provisionedServer
            ? {
                ...item,
                provisionedServer: {
                  ...item.provisionedServer,
                  status: "online",
                  console_logs: [
                    ...item.provisionedServer.console_logs,
                    `[${doneTime}] [Server thread/INFO]: Done (3.612s)! Servidor estable y en línea tras parche de IA Guardián.`,
                  ].slice(-40),
                },
              }
            : item
        )
      );
    }, 1200);
  };

  const handleProvisionComplete = () => {
    setIsProvisionModalOpen(false);
    setWorkspaceView("dashboard");
    window.setTimeout(() => {
      const target = document.getElementById("active-server-dashboard");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B1117] text-slate-100">
      <TopBar
        activeSection={activeNav}
        onNavigate={handleNavigate}
        hasArchitecture={Boolean(currentItem)}
        onExportJson={handleTopBarAction}
      />

      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col lg:flex-row">
        <HistorySidebar
          items={history}
          selectedId={selectedId}
          onSelect={handleSelectHistory}
          onDelete={handleDeleteHistory}
          onNew={handleNewConfig}
        />

        <main className="min-w-0 flex-1">
          <div className="border-b border-[#1E293B] bg-[#0B1117] px-6 py-3">
            <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Modo de configuración"
                className="inline-flex items-center gap-1 rounded-lg border border-[#1E293B] bg-[#0D141C] p-1"
              >
                <button
                  role="tab"
                  type="button"
                  aria-selected={composerMode === "wizard"}
                  onClick={() => setComposerMode("wizard")}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    composerMode === "wizard"
                      ? "bg-[#1A2430] text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Asistente guiado (4 pasos)
                </button>
                <button
                  role="tab"
                  type="button"
                  aria-selected={composerMode === "advanced"}
                  onClick={() => setComposerMode("advanced")}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    composerMode === "advanced"
                      ? "bg-[#1A2430] text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Modo técnico directo
                </button>
              </div>
              <span className="text-xs text-slate-500">
                Conectado al motor JSON estricto y verificación Modrinth
              </span>
            </div>
          </div>

          {composerMode === "wizard" ? (
            <DeployWizard
              isGenerating={isGenerating}
              retryStatus={retryStatus}
              error={error}
              onDeploy={handleWizardDeploy}
            />
          ) : (
            <PromptComposer
              spec={spec}
              onSpecChange={setSpec}
              isGenerating={isGenerating}
              retryStatus={retryStatus}
              error={error}
              onSubmit={() => handleGenerate()}
              inputRef={promptInputRef}
            />
          )}

          {currentItem?.provisionedServer && (
            <div
              id="active-server-dashboard"
              className="border-b border-[#1E293B] bg-[#0B1117] px-6 py-3"
            >
              <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-3">
                <div
                  role="tablist"
                  aria-label="Vista del servidor"
                  className="inline-flex items-center gap-1 rounded-lg border border-[#1E293B] bg-[#0D141C] p-1"
                >
                  <button
                    role="tab"
                    type="button"
                    aria-selected={workspaceView === "dashboard"}
                    onClick={() => setWorkspaceView("dashboard")}
                    className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      workspaceView === "dashboard"
                        ? "bg-emerald-600/20 text-emerald-300"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Dashboard de Servidor Activo
                  </button>
                  <button
                    role="tab"
                    type="button"
                    aria-selected={workspaceView === "architecture"}
                    onClick={() => setWorkspaceView("architecture")}
                    className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      workspaceView === "architecture"
                        ? "bg-[#1A2430] text-slate-100"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Arquitectura y JSON Estricto
                  </button>
                </div>

                <span className="font-mono text-xs text-slate-400 tabular-nums">
                  {currentItem.provisionedServer.public_ip}:
                  {currentItem.provisionedServer.port}
                </span>
              </div>
            </div>
          )}

          {currentItem?.provisionedServer && workspaceView === "dashboard" ? (
            <ActiveServerDashboard
              item={currentItem}
              onUpdateProvisionedServer={handleUpdateProvisionedServer}
              onApplyGuardianPatch={handleApplyGuardianPatch}
              onInspectArchitecture={() => setWorkspaceView("architecture")}
            />
          ) : (
            <ArchitectureWorkspace
              bundle={currentItem}
              isGenerating={isGenerating && !isProvisionModalOpen}
              isVerifying={isVerifying}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onVerifyArchitecture={handleVerifyArchitecture}
              onLoadSample={handleLoadSample}
              onProvisionServer={
                currentItem && !currentItem.provisionedServer
                  ? handleProvisionExistingArchitecture
                  : undefined
              }
            />
          )}
        </main>
      </div>

      <ProvisioningModal
        isOpen={isProvisionModalOpen}
        preview={modalPreview}
        architecture={modalArchitecture}
        provisioningResult={modalProvisionResult}
        planId={modalPlanId}
        error={modalError}
        onComplete={handleProvisionComplete}
        onClose={() => setIsProvisionModalOpen(false)}
      />
    </div>
  );
}
