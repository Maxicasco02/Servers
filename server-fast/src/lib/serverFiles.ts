import type { ServerArchitecture } from "../types/architecture";

export interface ServerPreset {
  id: string;
  label: string;
  serverName: string;
  modality: string;
  prompt: string;
  preferredEngine?: string;
  preferredVersion?: string;
  maxPlayers?: number;
}

export const SERVER_PRESETS: ServerPreset[] = [
  {
    id: "gta-rp",
    label: "GTA V Roleplay",
    serverName: "Los Santos Craft RP",
    modality: "GTA V Roleplay / Ciudad",
    prompt:
      "Mapa de ciudad custom, vehículos conducibles, chat de voz por proximidad, economía con dinero físico y sistema de trabajos policiales y mafias con multas automáticas.",
    preferredEngine: "Forge",
    preferredVersion: "1.20.1",
    maxPlayers: 60,
  },
  {
    id: "tech-industrial",
    label: "Industrial Create + Mekanism",
    serverName: "Fábrica Automática",
    modality: "Técnico / Industrial Pesado",
    prompt:
      "Progresión centrada en Create, Mekanism y almacenamiento digital con Applied Energistics 2, optimización de TPS y protecciones de chunks para equipos.",
    preferredEngine: "NeoForge",
    preferredVersion: "1.21.1",
    maxPlayers: 20,
  },
  {
    id: "survival-paper",
    label: "Survival Plugins (Paper)",
    serverName: "Atlas Survival",
    modality: "Survival Semi-Vanilla",
    prompt:
      "Sin obligar a los jugadores a instalar mods en su cliente; permisos por rangos, economía básica, subastas y protección de terrenos.",
    preferredEngine: "Paper",
    preferredVersion: "1.21.1",
    maxPlayers: 40,
  },
  {
    id: "rpg-medieval",
    label: "RPG Medieval con KubeJS",
    serverName: "Reinos de Eldoria",
    modality: "RPG Fantasía Medieval",
    prompt:
      "Generación de mundo mejorada, chat de voz por proximidad, mazmorras y un sistema personalizado de 4 clases guerreras con habilidades pasivas y misiones diarias.",
    preferredEngine: "Fabric",
    preferredVersion: "1.20.1",
    maxPlayers: 35,
  },
];

export function generateServerPropertiesText(arch: ServerArchitecture): string {
  const { project_meta, server_properties } = arch;
  return [
    "# Configuración generada por Server Fast",
    `motd=${project_meta.server_name} | ${project_meta.engine} ${project_meta.mc_version}`,
    `gamemode=${server_properties.gamemode}`,
    `pvp=${server_properties.pvp}`,
    `max-players=${server_properties.max_players}`,
    `online-mode=${server_properties.online_mode}`,
    `view-distance=${server_properties.view_distance}`,
    "simulation-distance=8",
    "enable-command-block=true",
    "spawn-protection=16",
    "difficulty=normal",
    "allow-flight=true",
    "sync-chunk-writes=true",
  ].join("\n");
}

export function generateStartScriptText(arch: ServerArchitecture): string {
  const ram = arch.project_meta.allocated_ram_gb;
  const engine = arch.project_meta.engine;
  const jarHint =
    engine === "Paper"
      ? `paper-${arch.project_meta.mc_version}.jar`
      : engine === "Fabric"
        ? `fabric-server-launch.jar`
        : `server.jar`;

  return [
    "#!/usr/bin/env bash",
    `# Script de arranque para ${arch.project_meta.server_name} (${engine} ${arch.project_meta.mc_version})`,
    `# RAM asignada: ${ram} GB`,
    "",
    `MEMORY="${ram}G"`,
    `SERVER_JAR="${jarHint}"`,
    "",
    "java -Xms${MEMORY} -Xmx${MEMORY} \\",
    "  -XX:+UseG1GC \\",
    "  -XX:+ParallelRefProcEnabled \\",
    "  -XX:MaxGCPauseMillis=200 \\",
    "  -XX:+UnlockExperimentalVMOptions \\",
    "  -XX:+DisableExplicitGC \\",
    "  -XX:+AlwaysPreTouch \\",
    "  -XX:G1NewSizePercent=30 \\",
    "  -XX:G1MaxNewSizePercent=40 \\",
    "  -XX:G1HeapRegionSize=8M \\",
    "  -XX:G1ReservePercent=20 \\",
    "  -XX:G1HeapWastePercent=5 \\",
    "  -XX:G1MixedGCCountTarget=4 \\",
    "  -XX:InitiatingHeapOccupancyPercent=15 \\",
    "  -XX:G1MixedGCLiveThresholdPercent=90 \\",
    "  -XX:G1RSetUpdatingPauseTimePercent=5 \\",
    "  -XX:SurvivorRatio=32 \\",
    "  -XX:+PerfDisableSharedMem \\",
    "  -XX:MaxTenuringThreshold=1 \\",
    "  -jar ${SERVER_JAR} nogui",
  ].join("\n");
}

export function generateKubeJsStub(arch: ServerArchitecture): string {
  const { project_meta, custom_scripts } = arch;
  if (!custom_scripts.kubejs_required) {
    return [
      `// ${project_meta.server_name} (${project_meta.engine} ${project_meta.mc_version})`,
      "// KubeJS no es requerido para esta configuración.",
      "// Todas las mecánicas solicitadas están cubiertas por los mods/plugins estándar.",
    ].join("\n");
  }

  return [
    `// kubejs/server_scripts/server_fast.js`,
    `// Proyecto: ${project_meta.server_name} (${project_meta.engine} ${project_meta.mc_version})`,
    `// Intención técnica:`,
    ...custom_scripts.script_intent
      .split(/\n+/)
      .map((line) => `// ${line}`),
    "",
    "ServerEvents.loaded((event) => {",
    `  console.info('[Server Fast] Cargando lógica personalizada para ${project_meta.server_name}');`,
    "});",
    "",
    "PlayerEvents.loggedIn((event) => {",
    "  const { player } = event;",
    "  if (!player.persistentData.contains('server_fast_init')) {",
    "    player.persistentData.putBoolean('server_fast_init', true);",
    "    // Inicializar estado de jugador según script_intent",
    "  }",
    "});",
    "",
    "ServerEvents.recipes((event) => {",
    "  // Ajustes de recetas o progresión personalizada aquí",
    "});",
  ].join("\n");
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
