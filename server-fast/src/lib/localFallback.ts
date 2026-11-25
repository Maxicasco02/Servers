import type {
  ArchitectureBundle,
  EngineType,
  ModDependency,
  ModVerificationResult,
  RamBreakdown,
  ServerArchitecture,
  ServerSpecInputs,
} from "../types/architecture";

function inferMaxPlayers(spec: ServerSpecInputs): number {
  const parsed = Number(spec.maxPlayers);
  if (Number.isFinite(parsed) && parsed >= 2 && parsed <= 500) {
    return Math.round(parsed);
  }
  const combined = `${spec.serverName} ${spec.modality} ${spec.requirements}`;
  const match = combined.match(/\b(\d{1,3})\s*(jugadores|players|personas|amigos|slots)\b/i);
  if (match) {
    const n = Number(match[1]);
    if (n >= 2 && n <= 500) return n;
  }
  return 20;
}

function inferEngine(spec: ServerSpecInputs): EngineType {
  if (
    spec.preferredEngine === "Forge" ||
    spec.preferredEngine === "Fabric" ||
    spec.preferredEngine === "NeoForge" ||
    spec.preferredEngine === "Paper"
  ) {
    return spec.preferredEngine;
  }
  const combined = `${spec.modality} ${spec.requirements}`.toLowerCase();
  if (/paper|spigot|bukkit|sin mods|plugins solamente|solo plugins/.test(combined)) {
    return "Paper";
  }
  if (/fabric|sodium|lithium/.test(combined)) {
    return "Fabric";
  }
  if (/neoforge|1\.21/.test(combined)) {
    return "NeoForge";
  }
  return "Forge";
}

function inferMcVersion(spec: ServerSpecInputs, engine: EngineType): string {
  if (spec.preferredVersion && spec.preferredVersion !== "auto") {
    return spec.preferredVersion;
  }
  return engine === "NeoForge" || engine === "Paper" ? "1.21.1" : "1.20.1";
}

export function buildLocalFallbackBundle(
  spec: ServerSpecInputs,
  reason: string
): ArchitectureBundle {
  const engine = inferEngine(spec);
  const mcVersion = inferMcVersion(spec, engine);
  const maxPlayers = inferMaxPlayers(spec);
  const combined = `${spec.serverName} ${spec.modality} ${spec.requirements}`.toLowerCase();

  const hasRpCityVehicles =
    /gta|roleplay|\brp\b|veh[ií]culo|autos?|coches?|ciudad|licencia|polic[ií]a|m[eé]dico/.test(
      combined
    );
  const hasVoice = /voz|voice|proximidad/.test(combined);
  const hasEconomy = /econom[ií]a|banco|dinero|tienda|subasta|moneda/.test(combined);
  const hasTech =
    /create|mekanism|industrial|t[eé]cnico|energ[ií]a|ae2|almacenamiento|maquinaria|automat/.test(
      combined
    );
  const hasMinimap = /minimapa|minimap|mapa/.test(combined);
  const hasRpg = /rpg|medieval|mazmorra|clases|jefes|misiones/.test(combined);

  const needsKubeJs =
    engine !== "Paper" &&
    /licencia|trabajo|polic[ií]a|m[eé]dico|facciones|clases|misiones|habilidades|custom/.test(
      combined
    );

  const mods: ModDependency[] = [];
  const plugins: string[] = [];

  if (engine === "Paper") {
    plugins.push("LuckPerms", "Vault", "EssentialsX", "WorldGuard", "spark");
    if (hasEconomy) plugins.push("EconomyShopGUI");
    if (hasVoice) plugins.push("SimpleVoiceChat");
  } else {
    if (needsKubeJs) {
      mods.push(
        { slug: "architectury-api", source: "modrinth", category: "core" },
        { slug: "cloth-config", source: "modrinth", category: "core" },
        { slug: "rhino", source: "modrinth", category: "core" },
        { slug: "kubejs", source: "modrinth", category: "core" }
      );
    }

    if (hasVoice) {
      mods.push({ slug: "simple-voice-chat", source: "modrinth", category: "voice" });
    }

    if (hasRpCityVehicles) {
      mods.push({
        slug: engine === "Forge" ? "ultimate-car-mod" : "automobility",
        source: "modrinth",
        category: "vehicle",
      });
      if (/ciudad|city|gta/.test(combined) && engine === "Forge") {
        mods.push({ slug: "the-lost-cities", source: "modrinth", category: "world" });
      }
      mods.push({ slug: "corpse", source: "modrinth", category: "utility" });
    }

    if (hasEconomy && engine === "Forge") {
      mods.push({ slug: "lightmans-currency", source: "modrinth", category: "economy" });
    }

    if (hasTech) {
      mods.push(
        { slug: "create", source: "modrinth", category: "core" },
        { slug: "ae2", source: "modrinth", category: "core" }
      );
      if (engine === "Forge" || engine === "NeoForge") {
        mods.push(
          { slug: "createaddition", source: "modrinth", category: "core" },
          { slug: "mekanism", source: "modrinth", category: "core" },
          { slug: "mekanism-generators", source: "modrinth", category: "core" }
        );
      }
    }

    if (hasRpg) {
      mods.push({ slug: "terralith", source: "modrinth", category: "world" });
    }

    if (hasMinimap) {
      mods.push(
        { slug: "xaeros-minimap", source: "modrinth", category: "utility" },
        { slug: "xaeros-world-map", source: "modrinth", category: "utility" }
      );
    }

    mods.push(
      { slug: "open-parties-and-claims", source: "modrinth", category: "world" },
      { slug: "jei", source: "modrinth", category: "utility" },
      { slug: "jade", source: "modrinth", category: "utility" },
      { slug: "modernfix", source: "modrinth", category: "utility" },
      { slug: "ferrite-core", source: "modrinth", category: "utility" },
      { slug: "spark", source: "modrinth", category: "utility" }
    );
  }

  // Deduplicate mods
  const uniqueMods: ModDependency[] = [];
  const seen = new Set<string>();
  for (const mod of mods) {
    if (!seen.has(mod.slug)) {
      seen.add(mod.slug);
      uniqueMods.push(mod);
    }
  }

  const base_gb = 4;
  const extraPlayers = Math.max(0, maxPlayers - 10);
  const players_gb = extraPlayers === 0 ? 0 : Math.ceil(extraPlayers / 25) * 2;

  let complexity_gb = 0;
  let complexity_label = "Survival Vanilla / Plugins únicamente (+0 GB)";
  if (engine !== "Paper" && (hasRpCityVehicles || hasVoice)) {
    complexity_gb = 4;
    complexity_label = "Autos, chat de voz por proximidad o ciudad GTA RP (+4 GB)";
  } else if (engine !== "Paper" && hasTech) {
    complexity_gb = 2;
    complexity_label = "Mods técnicos o industriales pesados (+2 GB)";
  }

  const rawTotal = base_gb + players_gb + complexity_gb;
  const total_gb = Math.min(32, Math.max(4, rawTotal));

  const ram_breakdown: RamBreakdown = {
    base_gb,
    players_gb,
    complexity_gb,
    complexity_label,
    total_gb,
    clamped: total_gb !== rawTotal,
  };

  const serverName =
    spec.serverName.trim() || spec.modality.trim() || "Server Fast Respaldo";

  const architecture: ServerArchitecture = {
    project_meta: {
      server_name: serverName,
      engine,
      mc_version: mcVersion,
      allocated_ram_gb: total_gb,
    },
    dependencies: {
      mods: uniqueMods,
      plugins,
    },
    server_properties: {
      gamemode: "survival",
      pvp: hasRpCityVehicles || /pvp|facciones/.test(combined),
      max_players: maxPlayers,
      online_mode: true,
      view_distance: maxPlayers >= 40 ? 8 : 10,
    },
    custom_scripts: {
      kubejs_required: needsKubeJs,
      script_intent: needsKubeJs
        ? `Implementar en KubeJS las mecánicas personalizadas solicitadas (${spec.requirements.trim() || spec.modality.trim()}) mediante persistentData, validación de permisos/licencias en eventos de interacción y comandos administrativos.`
        : "No requerido; las mecánicas solicitadas están cubiertas por los mods y plugins seleccionados.",
    },
  };

  const verifications: ModVerificationResult[] = uniqueMods.map((m) => ({
    slug: m.slug,
    source: m.source,
    status: "verified",
    project_url: `https://modrinth.com/mod/${m.slug}`,
    message: `Catálogo local compatible (${engine} ${mcVersion})`,
  }));

  return {
    architecture,
    ram_breakdown,
    verifications,
    generated_at: new Date().toISOString(),
    isFallback: true,
    fallbackReason: reason,
  };
}
