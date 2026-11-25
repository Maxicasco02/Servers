import type {
  LogDiagnosticResult,
  ServerArchitecture,
} from "../types/architecture";

export const GUARDIAN_ERROR_KEYWORDS = [
  "CrashReport",
  "NullPointerException",
  "Caused by:",
  "ModLoadingException",
  "OutOfMemoryError",
  "MixinApplyError",
  "MissingOrUnsupportedMandatoryDependency",
];

export const HEALTHY_STATUS_MESSAGE =
  "🟢 Servidor funcionando de forma óptima sin conflictos de memoria ni mods.";

export function findMatchedKeywords(logs: string[]): string[] {
  const joined = logs.join("\n");
  return GUARDIAN_ERROR_KEYWORDS.filter((kw) =>
    joined.toLowerCase().includes(kw.toLowerCase())
  );
}

export function parseLogsLocally(
  logs: string[],
  architecture: ServerArchitecture
): LogDiagnosticResult {
  const matchedKeywords = findMatchedKeywords(logs);
  if (matchedKeywords.length === 0) {
    return {
      healthy: true,
      summary: HEALTHY_STATUS_MESSAGE,
      matched_keywords: [],
      offending_mod_slug: null,
      offending_line: null,
      simple_cause: "",
      proposed_action: "",
      patch_action_type: "none",
      analyzed_by: "local_parser",
    };
  }

  const installedMods = architecture.dependencies.mods || [];
  const offendingLine =
    logs.find((line) =>
      GUARDIAN_ERROR_KEYWORDS.some((kw) =>
        line.toLowerCase().includes(kw.toLowerCase())
      )
    ) ?? logs[logs.length - 1] ?? null;

  const combinedLogsLower = logs.join("\n").toLowerCase();

  // Try matching any installed mod slug or normalized token in the crash logs
  let offendingModSlug: string | null = null;
  for (const mod of installedMods) {
    const slugLower = mod.slug.toLowerCase();
    const compactToken = slugLower.replace(/-/g, "");
    if (
      combinedLogsLower.includes(slugLower) ||
      combinedLogsLower.includes(compactToken)
    ) {
      offendingModSlug = mod.slug;
      break;
    }
  }

  // Fallback: extract mod name from patterns like "Mod <slug>" or "(<slug>)"
  if (!offendingModSlug && offendingLine) {
    const parenMatch = offendingLine.match(/\(([a-z0-9_-]{3,})\)/i);
    const modMatch = offendingLine.match(/mod(?:\s+id|\s+slug)?[:\s]+([a-z0-9_-]{3,})/i);
    const candidate = (modMatch?.[1] || parenMatch?.[1] || "").toLowerCase();
    if (candidate && candidate !== "minecraft" && candidate !== "forge") {
      offendingModSlug = candidate;
    }
  }

  if (!offendingModSlug && installedMods.length > 0) {
    // Prefer picking a non-core mod if a generic mod error appeared
    const nonCore = installedMods.find((m) => m.category !== "core");
    if (
      combinedLogsLower.includes("modloadingexception") ||
      combinedLogsLower.includes("mixinapplyerror")
    ) {
      offendingModSlug = (nonCore ?? installedMods[0]).slug;
    }
  }

  const hasMemoryIssue = combinedLogsLower.includes("outofmemoryerror");
  const hasNullPtr = combinedLogsLower.includes("nullpointerexception");
  const hasModLoad = combinedLogsLower.includes("modloadingexception");

  let simpleCause =
    "Un módulo del servidor generó una excepción crítica durante el arranque o ejecución del mundo.";
  if (hasMemoryIssue) {
    simpleCause =
      "El proceso Java agotó la memoria RAM asignada al intentar cargar entidades o chunks adicionales.";
  } else if (hasModLoad && offendingModSlug) {
    simpleCause = `El mod "${offendingModSlug}" falló durante la fase de carga de ${architecture.project_meta.engine} ${architecture.project_meta.mc_version}, posiblemente por un conflicto de Mixins o una dependencia incompatible.`;
  } else if (hasNullPtr && offendingModSlug) {
    simpleCause = `El mod "${offendingModSlug}" intentó acceder a un objeto nulo del mundo o de la red, provocando la caída del hilo principal.`;
  }

  const proposedAction = offendingModSlug
    ? `Desactivar mod conflictivo "${offendingModSlug}" de la Matriz de Mods y reiniciar el servidor de forma segura.`
    : "Limpiar caché de sesión y reiniciar el contenedor del servidor de forma segura.";

  return {
    healthy: false,
    summary: offendingModSlug
      ? `Conflicto crítico detectado en el mod ${offendingModSlug}`
      : "Excepción crítica detectada en la consola del servidor",
    matched_keywords: matchedKeywords,
    offending_mod_slug: offendingModSlug,
    offending_line: offendingLine,
    simple_cause: simpleCause,
    proposed_action: proposedAction,
    patch_action_type: offendingModSlug ? "remove_mod" : "restart_only",
    analyzed_by: "local_parser",
  };
}

export async function diagnoseServerLogs(
  logs: string[],
  architecture: ServerArchitecture
): Promise<LogDiagnosticResult> {
  const localCheck = parseLogsLocally(logs, architecture);
  if (localCheck.healthy) {
    return localCheck;
  }

  try {
    const res = await fetch("/api/guardian/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs, architecture }),
    });

    if (!res.ok) {
      return localCheck;
    }

    const data = (await res.json()) as Partial<LogDiagnosticResult>;
    if (!data || typeof data.healthy !== "boolean") {
      return localCheck;
    }

    return {
      healthy: data.healthy,
      summary: data.summary || localCheck.summary,
      matched_keywords:
        Array.isArray(data.matched_keywords) && data.matched_keywords.length > 0
          ? data.matched_keywords
          : localCheck.matched_keywords,
      offending_mod_slug:
        data.offending_mod_slug !== undefined
          ? data.offending_mod_slug
          : localCheck.offending_mod_slug,
      offending_line: data.offending_line || localCheck.offending_line,
      simple_cause: data.simple_cause || localCheck.simple_cause,
      proposed_action: data.proposed_action || localCheck.proposed_action,
      patch_action_type: data.patch_action_type || localCheck.patch_action_type,
      analyzed_by: data.analyzed_by || "local_parser",
    };
  } catch {
    return localCheck;
  }
}

export function buildSimulatedCrashLogs(
  architecture: ServerArchitecture
): string[] {
  const nowStr = new Date().toTimeString().slice(0, 8);
  const installedMods = architecture.dependencies.mods || [];
  const targetMod =
    installedMods.find((m) => m.category !== "core" && m.slug !== "kubejs") ??
    installedMods[0];
  const targetSlug = targetMod?.slug || "ultimate-car-mod";
  const classPrefix = targetSlug.replace(/[^a-z0-9]/gi, "");

  return [
    `[${nowStr}] [modloading-worker-0/ERROR]: Failed to load mod ${targetSlug} (${targetSlug}) on ${architecture.project_meta.engine} ${architecture.project_meta.mc_version}`,
    `[${nowStr}] [Server thread/FATAL]: net.minecraftforge.fml.ModLoadingException: ${targetSlug} encountered an error during the common_setup event phase`,
    `[${nowStr}] [Server thread/ERROR]: Caused by: java.lang.NullPointerException: Cannot invoke "net.minecraft.world.entity.EntityType.getDescriptionId()" because mod registry for (${targetSlug}) returned null`,
    `[${nowStr}] [Server thread/ERROR]:     at com.${classPrefix}.core.RegistryHandler.registerEntities(RegistryHandler.java:142) ~[${targetSlug}-1.20.1.jar:?]`,
    `[${nowStr}] [Server thread/FATAL]: CrashReport saved to ./crash-reports/crash-serverfast-${targetSlug}.txt`,
  ];
}
