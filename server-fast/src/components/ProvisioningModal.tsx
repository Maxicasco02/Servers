import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Server, X } from "lucide-react";
import type {
  ProvisionedServerRecord,
  ServerArchitecture,
} from "../types/architecture";
import type { PlanTierId } from "../lib/provisioningService";

export interface ProvisioningPreviewMeta {
  serverName: string;
  engine: string;
  mcVersion: string;
  allocatedRamGb: number;
  totalMods: number;
}

interface ProvisioningModalProps {
  isOpen: boolean;
  preview: ProvisioningPreviewMeta;
  architecture: ServerArchitecture | null;
  provisioningResult: ProvisionedServerRecord | null;
  planId: PlanTierId;
  error: string | null;
  onComplete: () => void;
  onClose: () => void;
}

const PLAN_LABELS: Record<PlanTierId, string> = {
  basic: "Basic · $29/mes",
  pro: "Pro · $69/mes",
  enterprise: "Enterprise · $149/mes",
};

export function ProvisioningModal({
  isOpen,
  preview,
  architecture,
  provisioningResult,
  planId,
  error,
  onComplete,
  onClose,
}: ProvisioningModalProps) {
  const [stepIndex, setStepIndex] = useState<number>(0);

  const resolvedServerName =
    architecture?.project_meta.server_name || preview.serverName;
  const resolvedEngine = architecture?.project_meta.engine || preview.engine;
  const resolvedVersion =
    architecture?.project_meta.mc_version || preview.mcVersion;
  const resolvedRam =
    architecture?.project_meta.allocated_ram_gb || preview.allocatedRamGb;
  const resolvedMods = architecture
    ? architecture.project_meta.engine === "Paper"
      ? architecture.dependencies.plugins.length
      : architecture.dependencies.mods.length
    : preview.totalMods;

  const steps = [
    {
      percent: 15,
      text: "Reservando contenedor Docker y puerto en nodo de alta velocidad...",
    },
    {
      percent: 40,
      text: `Instalando motor ${resolvedEngine} ${resolvedVersion} con ${resolvedRam} GB de RAM...`,
    },
    {
      percent: 70,
      text:
        resolvedEngine === "Paper"
          ? `Descargando e inyectando ${resolvedMods} plugins validados...`
          : `Descargando e inyectando ${resolvedMods} mods validados desde Modrinth...`,
    },
    {
      percent: 90,
      text: "Generando server.properties, reglas de firewall y scripts de KubeJS...",
    },
    {
      percent: 100,
      text: "¡Servidor en línea y listo para jugar!",
    },
  ];

  // Reset to step 0 when modal opens
  useEffect(() => {
    if (isOpen) {
      setStepIndex(0);
    }
  }, [isOpen]);

  // Progressive step advancement that never blocks UI on click
  useEffect(() => {
    if (!isOpen || error) return;

    if (stepIndex === 0) {
      const t = window.setTimeout(() => setStepIndex(1), 650);
      return () => window.clearTimeout(t);
    }
    if (stepIndex === 1) {
      const t = window.setTimeout(() => setStepIndex(2), 850);
      return () => window.clearTimeout(t);
    }
    if (stepIndex === 2) {
      // Wait smoothly at 70% only until architecture + provisioning record resolve
      if (!provisioningResult) return;
      const t = window.setTimeout(() => setStepIndex(3), 700);
      return () => window.clearTimeout(t);
    }
    if (stepIndex === 3) {
      const t = window.setTimeout(() => setStepIndex(4), 800);
      return () => window.clearTimeout(t);
    }
    if (stepIndex === 4) {
      const t = window.setTimeout(() => {
        onComplete();
      }, 850);
      return () => window.clearTimeout(t);
    }
  }, [isOpen, stepIndex, provisioningResult, error, onComplete]);

  const currentStep = steps[stepIndex] ?? steps[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="provisioning-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="provisioning-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#06090D]/80 px-4 py-6 backdrop-blur-sm"
        >
          <motion.div
            key="provisioning-card"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-xl rounded-xl border border-[#1E293B] bg-[#0E161F] p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#1E293B] pb-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <Server className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2
                    id="provisioning-modal-title"
                    className="font-display text-base font-semibold text-slate-100"
                  >
                    Desplegando {resolvedServerName}
                  </h2>
                  <p className="mt-0.5 font-mono text-xs text-slate-400 tabular-nums">
                    {resolvedEngine} {resolvedVersion} · {resolvedRam} GB RAM ·{" "}
                    {PLAN_LABELS[planId]}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar modal de despliegue"
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-[#16202C] hover:text-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {error ? (
              <div className="mt-5 space-y-4">
                <div
                  role="alert"
                  className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
                >
                  {error}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-[#1E293B] bg-[#111923] px-4 py-2 text-xs font-medium text-slate-200 hover:border-slate-600 cursor-pointer"
                  >
                    Volver al asistente
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                {/* Animated Progress Header */}
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium text-slate-200">
                    {currentStep.text}
                  </span>
                  <span className="font-mono text-sm font-semibold text-emerald-400 tabular-nums shrink-0">
                    {currentStep.percent}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div
                  role="progressbar"
                  aria-valuenow={currentStep.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-[#16202C]"
                >
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: `${currentStep.percent}%` }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full bg-emerald-500"
                  />
                </div>

                {/* 5-Step Checklist */}
                <ol className="mt-6 space-y-2.5">
                  {steps.map((s, idx) => {
                    const isCompleted = idx < stepIndex || stepIndex === 4;
                    const isActive = idx === stepIndex && stepIndex < 4;
                    return (
                      <li
                        key={s.percent}
                        className={`flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-xs transition-colors ${
                          isActive
                            ? "border-emerald-500/50 bg-[#13202D] text-slate-100"
                            : isCompleted
                              ? "border-[#1E293B] bg-[#0B1117] text-slate-300"
                              : "border-[#1E293B]/60 bg-[#0B1117]/50 text-slate-500"
                        }`}
                      >
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                          {isCompleted ? (
                            <Check
                              className="h-4 w-4 text-emerald-400"
                              aria-hidden="true"
                            />
                          ) : isActive ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin text-emerald-400"
                              aria-hidden="true"
                            />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium leading-relaxed">
                              {s.text}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                              {s.percent}%
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {/* Footer Action */}
                <div className="mt-6 flex items-center justify-between gap-3 border-t border-[#1E293B] pt-4">
                  <span className="font-mono text-[11px] text-slate-500">
                    {provisioningResult
                      ? provisioningResult.provider_mode === "pterodactyl_live"
                        ? "Conectado a Pterodactyl Panel"
                        : "Pipeline Pterodactyl / n8n listo"
                      : "Compilando arquitectura y asignando nodo..."}
                  </span>

                  {stepIndex === 4 && (
                    <button
                      type="button"
                      onClick={onComplete}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 cursor-pointer"
                    >
                      Abrir Dashboard de Servidor Activo
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
