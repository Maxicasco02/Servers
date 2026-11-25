import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import type { LogDiagnosticResult } from "../types/architecture";

interface GuardianAnalysisModalProps {
  isOpen: boolean;
  isScanning: boolean;
  isApplyingPatch: boolean;
  diagnostic: LogDiagnosticResult | null;
  onApplyPatch: (diagnostic: LogDiagnosticResult) => void;
  onClose: () => void;
}

export function GuardianAnalysisModal({
  isOpen,
  isScanning,
  isApplyingPatch,
  diagnostic,
  onApplyPatch,
  onClose,
}: GuardianAnalysisModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="guardian-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="guardian-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#06090D]/80 px-4 py-6 backdrop-blur-sm"
        >
          <motion.div
            key="guardian-card"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl rounded-xl border border-[#1E293B] bg-[#0E161F] p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[#1E293B] pb-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/35 bg-amber-500/10 text-amber-400">
                  {isScanning ? (
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <h2
                    id="guardian-modal-title"
                    className="font-display text-base font-semibold text-slate-100"
                  >
                    {isScanning
                      ? "IA Guardián analizando consola en vivo..."
                      : "Diagnóstico de IA Guardián"}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {isScanning
                      ? "Escaneando trazas de CrashReport, ModLoadingException y NullPointerException."
                      : diagnostic?.summary ||
                        "Se detectaron errores críticos en la consola del servidor."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={isApplyingPatch}
                aria-label="Cerrar análisis de IA Guardián"
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-[#16202C] hover:text-slate-100 disabled:opacity-50 cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {isScanning ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Loader2
                  className="h-7 w-7 animate-spin text-emerald-400"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-medium text-slate-200">
                  Inspeccionando logs del contenedor y correlacionando mods...
                </p>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  Buscando CrashReport · NullPointerException · Caused by: · ModLoadingException
                </p>
              </div>
            ) : diagnostic ? (
              <div className="mt-5 space-y-4">
                {diagnostic.matched_keywords.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Patrones detectados:{" "}
                      <span className="font-mono text-amber-200">
                        {diagnostic.matched_keywords.join(", ")}
                      </span>
                    </span>
                  </div>
                )}

                {/* a) Mod o línea exacta */}
                <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-300">
                      a) Mod o línea exacta causante del fallo
                    </p>
                    {diagnostic.offending_mod_slug && (
                      <span className="font-mono text-xs font-semibold text-red-400">
                        Mod: {diagnostic.offending_mod_slug}
                      </span>
                    )}
                  </div>
                  {diagnostic.offending_line && (
                    <pre className="mt-2.5 overflow-x-auto rounded border border-red-500/25 bg-[#090D12] p-3 font-mono text-xs leading-relaxed text-red-300">
                      {diagnostic.offending_line}
                    </pre>
                  )}
                </div>

                {/* b) Causa en lenguaje sencillo */}
                <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-4">
                  <p className="text-xs font-semibold text-slate-300">
                    b) Causa del conflicto
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-200">
                    {diagnostic.simple_cause}
                  </p>
                </div>

                {/* c) Acción correctiva propuesta */}
                <div className="rounded-lg border border-emerald-500/35 bg-emerald-950/20 p-4">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs font-semibold text-emerald-300">
                        c) Acción correctiva propuesta
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-100">
                        {diagnostic.proposed_action}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1E293B] pt-4">
                  <span className="font-mono text-[11px] text-slate-500">
                    {diagnostic.analyzed_by === "gemini"
                      ? "Analizado por IA Guardián (Gemini)"
                      : "Analizado por Parser Guardián local"}
                  </span>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isApplyingPatch}
                      className="rounded-lg border border-[#1E293B] bg-[#111923] px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 disabled:opacity-50 cursor-pointer"
                    >
                      Cerrar
                    </button>

                    <button
                      type="button"
                      disabled={isApplyingPatch}
                      onClick={() => onApplyPatch(diagnostic)}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                    >
                      {isApplyingPatch ? (
                        <>
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                          <span>Aplicando parche y reiniciando...</span>
                        </>
                      ) : (
                        <>
                          <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Aplicar Parche Automático</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
