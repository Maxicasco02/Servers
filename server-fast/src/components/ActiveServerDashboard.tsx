import { useEffect, useState } from "react";
import {
  Bug,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode2,
  Loader2,
  Play,
  RotateCw,
  Sparkles,
  Square,
  Terminal,
} from "lucide-react";
import type {
  LogDiagnosticResult,
  ProvisionedServerRecord,
  SavedArchitecture,
  ServerPowerStatus,
} from "../types/architecture";
import { sendServerPowerAction } from "../lib/provisioningService";
import {
  buildSimulatedCrashLogs,
  diagnoseServerLogs,
  GUARDIAN_ERROR_KEYWORDS,
  HEALTHY_STATUS_MESSAGE,
} from "../lib/guardianService";
import { GuardianAnalysisModal } from "./GuardianAnalysisModal";

interface ActiveServerDashboardProps {
  item: SavedArchitecture;
  onUpdateProvisionedServer: (
    itemId: string,
    nextServer: ProvisionedServerRecord
  ) => void;
  onApplyGuardianPatch: (
    itemId: string,
    diagnostic: LogDiagnosticResult
  ) => Promise<void>;
  onInspectArchitecture: () => void;
}

const PLAN_NAMES: Record<ProvisionedServerRecord["plan_id"], string> = {
  basic: "Basic ($29/mes)",
  pro: "Pro ($69/mes)",
  enterprise: "Enterprise ($149/mes)",
};

export function ActiveServerDashboard({
  item,
  onUpdateProvisionedServer,
  onApplyGuardianPatch,
  onInspectArchitecture,
}: ActiveServerDashboardProps) {
  const server = item.provisionedServer;
  const { project_meta, server_properties, dependencies } = item.architecture;

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showSftpPassword, setShowSftpPassword] = useState(false);
  const [showConsole, setShowConsole] = useState(true);
  const [isActionBusy, setIsActionBusy] = useState(false);

  // Guardian AI State
  const [isGuardianOpen, setIsGuardianOpen] = useState(false);
  const [isScanningLogs, setIsScanningLogs] = useState(false);
  const [isApplyingPatch, setIsApplyingPatch] = useState(false);
  const [guardianDiagnostic, setGuardianDiagnostic] =
    useState<LogDiagnosticResult | null>(null);
  const [healthyNotice, setHealthyNotice] = useState<string | null>(null);

  // Live resource telemetry derived deterministically from current power state
  const maxRam = project_meta.allocated_ram_gb;
  const baseUsedRam = Number(Math.min(maxRam - 0.6, maxRam * 0.56).toFixed(1));
  const [usedRamGb, setUsedRamGb] = useState<number>(
    server?.status === "online" ? baseUsedRam : 0
  );
  const [cpuPercent, setCpuPercent] = useState<number>(
    server?.status === "online" ? 14.8 : 0
  );

  useEffect(() => {
    if (!server) return;
    if (server.status === "stopped") {
      setUsedRamGb(0);
      setCpuPercent(0);
      return;
    }
    if (server.status === "restarting") {
      setUsedRamGb(Number((maxRam * 0.24).toFixed(1)));
      setCpuPercent(62.4);
      return;
    }

    setUsedRamGb(baseUsedRam);
    setCpuPercent(15.2);

    const interval = window.setInterval(() => {
      const ramJitter = (Math.random() - 0.5) * 0.4;
      const nextRam = Math.min(
        maxRam - 0.3,
        Math.max(1.8, baseUsedRam + ramJitter)
      );
      const nextCpu = Math.min(48, Math.max(8.5, 14.5 + (Math.random() - 0.4) * 9));
      setUsedRamGb(Number(nextRam.toFixed(1)));
      setCpuPercent(Number(nextCpu.toFixed(1)));
    }, 2400);

    return () => window.clearInterval(interval);
  }, [server?.status, maxRam, baseUsedRam, server]);

  useEffect(() => {
    setHealthyNotice(null);
    setGuardianDiagnostic(null);
    setIsGuardianOpen(false);
  }, [item.id]);

  if (!server) return null;

  const ipAddress = `${server.public_ip}:${server.port}`;

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Clipboard blocked in restricted iframe
    }
  };

  const appendLogAndStatus = (
    status: ServerPowerStatus,
    logLine: string,
    baseLogs: string[]
  ): ProvisionedServerRecord => {
    const nowStr = new Date().toTimeString().slice(0, 8);
    return {
      ...server,
      status,
      console_logs: [...baseLogs, `[${nowStr}] ${logLine}`].slice(-40),
    };
  };

  const handlePowerControl = async (action: "start" | "restart" | "stop") => {
    if (isActionBusy) return;
    setIsActionBusy(true);

    try {
      const result = await sendServerPowerAction(server.server_id, action);

      if (action === "restart") {
        const restartingRecord = appendLogAndStatus(
          "restarting",
          "[ServerFast/Daemon]: Reiniciando contenedor y guardando mundo...",
          server.console_logs
        );
        onUpdateProvisionedServer(item.id, restartingRecord);

        window.setTimeout(() => {
          const onlineRecord = appendLogAndStatus(
            "online",
            "[Server thread/INFO]: Servidor reiniciado y en línea (3.940s)!",
            restartingRecord.console_logs
          );
          onUpdateProvisionedServer(item.id, onlineRecord);
          setIsActionBusy(false);
        }, 1400);
        return;
      }

      if (action === "stop") {
        const stoppedRecord = appendLogAndStatus(
          result.status,
          "[ServerFast/Daemon]: Instancia detenida de forma segura. Mundo guardado.",
          server.console_logs
        );
        onUpdateProvisionedServer(item.id, stoppedRecord);
      } else {
        const startedRecord = appendLogAndStatus(
          result.status,
          "[Server thread/INFO]: Instancia iniciada y escuchando en el puerto 25565.",
          server.console_logs
        );
        onUpdateProvisionedServer(item.id, startedRecord);
      }
    } finally {
      if (action !== "restart") {
        setIsActionBusy(false);
      }
    }
  };

  const handleAutoDiagnose = async () => {
    setShowConsole(true);
    setHealthyNotice(null);
    setGuardianDiagnostic(null);
    setIsScanningLogs(true);

    try {
      const result = await diagnoseServerLogs(
        server.console_logs,
        item.architecture
      );
      if (result.healthy) {
        setHealthyNotice(result.summary || HEALTHY_STATUS_MESSAGE);
      } else {
        setGuardianDiagnostic(result);
        setIsGuardianOpen(true);
      }
    } finally {
      setIsScanningLogs(false);
    }
  };

  const handleInjectTestCrash = () => {
    setHealthyNotice(null);
    const crashLines = buildSimulatedCrashLogs(item.architecture);
    onUpdateProvisionedServer(item.id, {
      ...server,
      console_logs: [...server.console_logs, ...crashLines].slice(-40),
    });
  };

  const handleApplyPatchFromModal = async (diagnostic: LogDiagnosticResult) => {
    if (isApplyingPatch) return;
    setIsApplyingPatch(true);
    try {
      await onApplyGuardianPatch(item.id, diagnostic);
      setIsGuardianOpen(false);
      setGuardianDiagnostic(null);
      setHealthyNotice(
        diagnostic.offending_mod_slug
          ? `Parche aplicado: "${diagnostic.offending_mod_slug}" fue removido de la Matriz de Mods y el servidor se reinició de forma segura.`
          : "Parche aplicado y servidor reiniciado de forma segura."
      );
    } finally {
      setIsApplyingPatch(false);
    }
  };

  const ramPercent = Math.min(100, Math.round((usedRamGb / maxRam) * 100));

  const statusMeta: Record<
    ServerPowerStatus,
    { label: string; dotClass: string; textClass: string }
  > = {
    online: {
      label: "Online / En ejecución",
      dotClass: "bg-emerald-400",
      textClass: "text-emerald-400",
    },
    restarting: {
      label: "Reiniciando instancia...",
      dotClass: "bg-amber-400 animate-pulse",
      textClass: "text-amber-300",
    },
    stopped: {
      label: "Detenido",
      dotClass: "bg-red-400",
      textClass: "text-red-300",
    },
  };

  const currentStatus = statusMeta[server.status];

  return (
    <section
      aria-label="Dashboard de Servidor Activo"
      className="mx-auto max-w-[1160px] px-6 py-7 space-y-6"
    >
      {/* Header Banner */}
      <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl font-semibold text-slate-100">
                {project_meta.server_name}
              </h2>
              <span
                className={`inline-flex items-center gap-2 text-xs font-medium ${currentStatus.textClass}`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${currentStatus.dotClass}`}
                />
                {currentStatus.label}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-xs text-slate-400 tabular-nums">
              {project_meta.engine} {project_meta.mc_version} ·{" "}
              {PLAN_NAMES[server.plan_id]} ·{" "}
              {project_meta.engine === "Paper"
                ? `${dependencies.plugins.length} plugins`
                : `${dependencies.mods.length} mods activos`}
            </p>
          </div>

          {/* Public IP + Copy */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-lg border border-[#1E293B] bg-[#0B1117] px-3.5 py-2">
              <div>
                <p className="text-[11px] text-slate-400">Dirección IP pública</p>
                <p className="font-mono text-sm font-semibold text-emerald-400 tabular-nums">
                  {ipAddress}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy("public_ip", ipAddress)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#1E293B] bg-[#111923] px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 cursor-pointer"
              >
                {copiedKey === "public_ip" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copiar IP</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Control Action Row */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#1E293B] pt-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {server.status === "stopped" ? (
              <button
                type="button"
                disabled={isActionBusy}
                onClick={() => handlePowerControl("start")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Iniciar</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isActionBusy || server.status === "restarting"}
                onClick={() => handlePowerControl("stop")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-950/30 px-3.5 py-2 text-xs font-medium text-red-200 transition-colors hover:bg-red-900/40 disabled:opacity-50 cursor-pointer"
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Detener</span>
              </button>
            )}

            <button
              type="button"
              disabled={isActionBusy || server.status === "stopped"}
              onClick={() => handlePowerControl("restart")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#0D141C] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 disabled:opacity-50 cursor-pointer"
            >
              <RotateCw
                className={`h-3.5 w-3.5 ${
                  server.status === "restarting" ? "animate-spin" : ""
                }`}
                aria-hidden="true"
              />
              <span>Reiniciar</span>
            </button>

            <button
              type="button"
              onClick={() => setShowConsole((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                showConsole
                  ? "border-emerald-500/60 bg-[#15222E] text-emerald-300"
                  : "border-[#1E293B] bg-[#0D141C] text-slate-200 hover:border-slate-600"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ver Consola de Logs</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onInspectArchitecture}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#0D141C] px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 cursor-pointer"
          >
            <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Inspeccionar JSON Estricto y Mods</span>
          </button>
        </div>
      </div>

      {/* Real-Time Telemetry Strip */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Consumo de RAM</span>
            <span className="font-mono text-slate-300 tabular-nums">
              {ramPercent}%
            </span>
          </div>
          <p className="mt-2 font-mono text-xl font-semibold text-emerald-400 tabular-nums">
            {usedRamGb.toFixed(1)} GB{" "}
            <span className="text-xs font-normal text-slate-400">
              / {maxRam} GB asignados
            </span>
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#0B1117]">
            <div
              style={{ width: `${ramPercent}%` }}
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
            />
          </div>
        </div>

        <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Carga de CPU dedicada</span>
            <span className="font-mono text-slate-500 tabular-nums">
              vCPU Ryzen
            </span>
          </div>
          <p className="mt-2 font-mono text-xl font-semibold text-slate-100 tabular-nums">
            {cpuPercent.toFixed(1)}%
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#0B1117]">
            <div
              style={{ width: `${Math.min(100, Math.round(cpuPercent))}%` }}
              className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
            />
          </div>
        </div>

        <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Jugadores conectados</span>
            <span className="font-mono text-slate-500 tabular-nums">
              Puerto {server.port}
            </span>
          </div>
          <p className="mt-2 font-mono text-xl font-semibold text-slate-100 tabular-nums">
            0{" "}
            <span className="text-xs font-normal text-slate-400">
              / {server_properties.max_players} slots
            </span>
          </p>
          <p className="mt-2.5 text-xs text-slate-500">
            {server.status === "online"
              ? "Esperando conexiones en la red pública"
              : "Servidor fuera de línea"}
          </p>
        </div>
      </div>

      {/* SFTP & Pterodactyl Access Credentials */}
      <div className="rounded-xl border border-[#1E293B] bg-[#111923] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] pb-3.5">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Credenciales de acceso SFTP y Panel Pterodactyl
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Administra archivos del mundo, mods y scripts KubeJS directamente por SFTP o desde el panel web.
            </p>
          </div>
          <span className="font-mono text-[11px] text-slate-400">
            ID nodo: {server.server_id} ·{" "}
            {server.provider_mode === "pterodactyl_live"
              ? "Pterodactyl Live"
              : "Listo para Pterodactyl API / n8n"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Servidor SFTP</span>
              <button
                type="button"
                onClick={() =>
                  handleCopy("sftp_host", `${server.sftp.host}:${server.sftp.port}`)
                }
                aria-label="Copiar host SFTP"
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {copiedKey === "sftp_host" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p className="mt-1.5 truncate font-mono text-xs text-slate-200">
              {server.sftp.host}:{server.sftp.port}
            </p>
          </div>

          <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Usuario SFTP</span>
              <button
                type="button"
                onClick={() => handleCopy("sftp_user", server.sftp.username)}
                aria-label="Copiar usuario SFTP"
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {copiedKey === "sftp_user" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p className="mt-1.5 truncate font-mono text-xs text-slate-200">
              {server.sftp.username}
            </p>
          </div>

          <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Contraseña SFTP</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSftpPassword((prev) => !prev)}
                  aria-label={
                    showSftpPassword
                      ? "Ocultar contraseña SFTP"
                      : "Mostrar contraseña SFTP"
                  }
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {showSftpPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy("sftp_pass", server.sftp.password)}
                  aria-label="Copiar contraseña SFTP"
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {copiedKey === "sftp_pass" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
            <p className="mt-1.5 truncate font-mono text-xs text-slate-200">
              {showSftpPassword ? server.sftp.password : "••••••••••••"}
            </p>
          </div>

          <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Panel Pterodactyl</span>
              <button
                type="button"
                onClick={() => handleCopy("panel_url", server.panel_url)}
                aria-label="Copiar URL del panel"
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {copiedKey === "panel_url" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs text-emerald-400">
                {server.panel_url}
              </span>
              <ExternalLink
                className="h-3 w-3 shrink-0 text-slate-500"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Console Log Viewer */}
      {showConsole && (
        <div className="overflow-hidden rounded-xl border border-[#1E293B] bg-[#090E14]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] bg-[#0D141C] px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
              <Terminal className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Consola de Logs en vivo ({server.server_id})</span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={isScanningLogs}
                onClick={handleAutoDiagnose}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                {isScanningLogs ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Escaneando logs...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>✨ Auto-Diagnosticar y Reparar con IA</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleInjectTestCrash}
                title="Inyecta una traza de error de prueba para probar el Agente Guardián"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#111923] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-amber-500/40 hover:text-amber-300 whitespace-nowrap cursor-pointer"
              >
                <Bug className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Simular Crash</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleCopy("console_logs", server.console_logs.join("\n"))
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#111923] px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 whitespace-nowrap cursor-pointer"
              >
                {copiedKey === "console_logs" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Logs copiados</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copiar logs</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {healthyNotice && (
            <div
              role="status"
              className="border-b border-emerald-500/30 bg-emerald-950/30 px-4 py-2.5 text-xs font-medium text-emerald-300"
            >
              {healthyNotice}
            </div>
          )}

          <pre className="max-h-72 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-slate-300">
            {server.console_logs.map((line, i) => {
              const isErrorLine =
                GUARDIAN_ERROR_KEYWORDS.some((kw) =>
                  line.toLowerCase().includes(kw.toLowerCase())
                ) || /\[.*\/(FATAL|ERROR)\]/.test(line);

              return (
                <div
                  key={`${i}-${line.slice(0, 12)}`}
                  className={
                    isErrorLine
                      ? "text-red-400"
                      : line.includes("Done") ||
                          line.includes("en línea") ||
                          line.includes("GuardianAI")
                        ? "text-emerald-400"
                        : line.includes("Detenida") ||
                            line.includes("detenida") ||
                            line.includes("Reiniciando")
                          ? "text-amber-300"
                          : "text-slate-300"
                  }
                >
                  {line}
                </div>
              );
            })}
          </pre>
        </div>
      )}

      <GuardianAnalysisModal
        isOpen={isGuardianOpen}
        isScanning={isScanningLogs}
        isApplyingPatch={isApplyingPatch}
        diagnostic={guardianDiagnostic}
        onApplyPatch={handleApplyPatchFromModal}
        onClose={() => setIsGuardianOpen(false)}
      />
    </section>
  );
}
