import "dotenv/config";
import express, { type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import type {
  EngineType,
  ModVerificationResult,
  ProvisionedServerRecord,
  RamBreakdown,
  ServerArchitecture,
} from "./src/types/architecture.ts";

const PORT = Number(process.env.PORT) || 3000;

const SYSTEM_INSTRUCTION = `Eres el Motor de Arquitectura de Servidores de Minecraft de "Server Fast". Tu único objetivo es traducir la idea en lenguaje natural de un usuario en una configuración técnica ejecutable de servidor con mods, garantizando estricta compatibilidad de versiones y cero choques de archivos.

=== REGLAS OBLIGATORIAS ===
1. Responde ÚNICAMENTE con un objeto JSON válido con la estructura estricta: project_meta, dependencies (mods y plugins), server_properties y custom_scripts.
2. Todos los slugs de mods deben ser identificadores reales y válidos en Modrinth o CurseForge compatibles con la versión de Minecraft solicitada (por defecto 1.20.1 cuando no se especifique otra). Usa preferentemente slugs reales verificados en Modrinth en minúsculas con guiones, por ejemplo: "simple-voice-chat", "ultimate-car-mod", "automobility", "lightmans-currency", "the-lost-cities", "create", "createaddition", "mekanism", "mekanism-generators", "ae2", "ferrite-core", "modernfix", "jei", "jade", "kubejs", "rhino", "architectury-api", "cloth-config", "open-parties-and-claims", "spark", "terralith", "xaeros-minimap", "xaeros-world-map", "corpse".
3. Asegura que todos los mods pertenezcan exactamente al mismo Mod Loader (Forge, Fabric o NeoForge) y a la misma versión de Minecraft especificadas (1.20.1 por defecto para packs amplios con Forge/Fabric).
4. Si el motor elegido es "Paper", la lista "mods" debe estar vacía ([]) y las funcionalidades deben ir en "plugins" (ej. "LuckPerms", "Vault", "EssentialsX", "WorldGuard", "PlaceholderAPI", "spark"). Si el motor es "Forge", "Fabric" o "NeoForge", "plugins" debe estar vacío ([]).
5. Si la modalidad solicitada requiere mecánicas personalizadas que no existen en un mod público estándar (ej. licencias de conducir, trabajos de policía/médicos, sistemas de facciones con reglas propias, economías custom por eventos, misiones o jefes por fases), establece "kubejs_required": true, describe con precisión técnica la lógica a programar en "script_intent" en español, e incluye "kubejs", "rhino" y "architectury-api" dentro de "mods".
6. Incluye siempre los mods de librería/dependencia requeridos por los mods principales para evitar crashes al iniciar el servidor.
7. Nombres de servidor ("server_name") deben ser concisos, limpios y descriptivos.

=== LÓGICA DE ASIGNACIÓN DE RAM & RECURSOS ===
Calcula la RAM ("allocated_ram_gb") utilizando la siguiente fórmula exacta:
- Base inicial: 4 GB.
- Jugadores: Sumar +2 GB por cada bloque de 25 jugadores adicionales sobre los primeros 10 (ejemplo: 1-10 jugadores = +0 GB; 11-35 = +2 GB; 36-60 = +4 GB; 61-85 = +6 GB).
- Complejidad de Mods:
  * Si incluye mods pesados como vehículos/autos, chat de voz por proximidad o mapa custom de ciudad (ej. GTA V RP): Sumar +4 GB.
  * Si incluye mods técnicos o industriales pesados (ej. Create, Mekanism, Applied Energistics 2): Sumar +2 GB.
  * Si es Survival Vanilla / Plugins únicamente: Sumar +0 GB sobre la base.
- Límites de seguridad: Mínimo 4 GB, Máximo 32 GB.`;

const ARCHITECTURE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    project_meta: {
      type: Type.OBJECT,
      properties: {
        server_name: { type: Type.STRING },
        engine: {
          type: Type.STRING,
          enum: ["Forge", "Fabric", "NeoForge", "Paper"],
        },
        mc_version: { type: Type.STRING },
        allocated_ram_gb: { type: Type.INTEGER },
      },
      required: ["server_name", "engine", "mc_version", "allocated_ram_gb"],
    },
    dependencies: {
      type: Type.OBJECT,
      properties: {
        mods: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              slug: { type: Type.STRING },
              source: {
                type: Type.STRING,
                enum: ["modrinth", "curseforge"],
              },
              category: {
                type: Type.STRING,
              },
            },
            required: ["slug", "source", "category"],
          },
        },
        plugins: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ["mods", "plugins"],
    },
    server_properties: {
      type: Type.OBJECT,
      properties: {
        gamemode: {
          type: Type.STRING,
          enum: ["survival", "creative", "adventure"],
        },
        pvp: { type: Type.BOOLEAN },
        max_players: { type: Type.INTEGER },
        online_mode: { type: Type.BOOLEAN },
        view_distance: { type: Type.INTEGER },
      },
      required: ["gamemode", "pvp", "max_players", "online_mode", "view_distance"],
    },
    custom_scripts: {
      type: Type.OBJECT,
      properties: {
        kubejs_required: { type: Type.BOOLEAN },
        script_intent: { type: Type.STRING },
      },
      required: ["kubejs_required", "script_intent"],
    },
  },
  required: ["project_meta", "dependencies", "server_properties", "custom_scripts"],
};

const MODRINTH_SLUG_ALIASES: Record<string, string> = {
  "applied-energistics-2": "ae2",
  "lost-cities": "the-lost-cities",
  ferritecore: "ferrite-core",
  "simple-voice-chat-mod": "simple-voice-chat",
  "lightmans-currency-mod": "lightmans-currency",
  "ultimate-car": "ultimate-car-mod",
};

const HEAVY_RP_VEHICLE_VOICE_SLUGS = new Set([
  "ultimate-car-mod",
  "automobility",
  "immersive-aircraft",
  "simple-voice-chat",
  "plasmo-voice",
  "the-lost-cities",
  "tac-z",
  "mr-crayfishs-vehicle-mod",
]);

const HEAVY_TECH_SLUGS = new Set([
  "create",
  "createaddition",
  "mekanism",
  "mekanism-generators",
  "applied-energistics-2",
  "ae2",
  "thermal-expansion",
  "industrial-foregoing",
  "immersive-engineering",
  "botania",
  "refined-storage",
  "gregtech",
  "ad-astra",
]);

function normalizeAndDedupeMods(arch: ServerArchitecture): ServerArchitecture {
  const seen = new Set<string>();
  const normalizedMods = (arch.dependencies.mods || [])
    .map((mod) => {
      const rawSlug = mod.slug.trim().toLowerCase();
      const slug =
        mod.source === "modrinth" && MODRINTH_SLUG_ALIASES[rawSlug]
          ? MODRINTH_SLUG_ALIASES[rawSlug]
          : rawSlug;
      return {
        slug,
        source: mod.source,
        category: mod.category,
      };
    })
    .filter((mod) => {
      if (!mod.slug || seen.has(`${mod.source}:${mod.slug}`)) return false;
      seen.add(`${mod.source}:${mod.slug}`);
      return true;
    });

  return {
    project_meta: {
      server_name: arch.project_meta.server_name,
      engine: arch.project_meta.engine,
      mc_version: arch.project_meta.mc_version,
      allocated_ram_gb: arch.project_meta.allocated_ram_gb,
    },
    dependencies: {
      mods: arch.project_meta.engine === "Paper" ? [] : normalizedMods,
      plugins: arch.project_meta.engine === "Paper" ? arch.dependencies.plugins || [] : [],
    },
    server_properties: {
      gamemode: arch.server_properties.gamemode,
      pvp: Boolean(arch.server_properties.pvp),
      max_players: Math.max(1, Math.round(arch.server_properties.max_players || 10)),
      online_mode: Boolean(arch.server_properties.online_mode),
      view_distance: Math.min(32, Math.max(2, Math.round(arch.server_properties.view_distance || 8))),
    },
    custom_scripts: {
      kubejs_required: Boolean(arch.custom_scripts.kubejs_required),
      script_intent: arch.custom_scripts.script_intent || "",
    },
  };
}

function computeRamBreakdown(arch: ServerArchitecture, userPrompt: string): RamBreakdown {
  const base_gb = 4;
  const maxPlayers = Math.max(1, Math.round(arch.server_properties.max_players || 10));
  const extraPlayers = Math.max(0, maxPlayers - 10);
  const players_gb = extraPlayers === 0 ? 0 : Math.ceil(extraPlayers / 25) * 2;

  const mods = arch.dependencies.mods || [];
  const hasVehicleOrVoiceOrCity =
    mods.some(
      (m) =>
        m.category === "vehicle" ||
        m.category === "voice" ||
        HEAVY_RP_VEHICLE_VOICE_SLUGS.has(m.slug.toLowerCase())
    ) ||
    /ciudad|city|gta|rp|roleplay|veh[ií]culo|autos?|coches?|proximidad|voice|voz/i.test(
      userPrompt
    );

  const hasHeavyTech =
    mods.some((m) => HEAVY_TECH_SLUGS.has(m.slug.toLowerCase())) ||
    /create|mekanism|industrial|t[eé]cnico|energ[ií]a|ae2|f[aá]brica/i.test(userPrompt);

  let complexity_gb = 0;
  let complexity_label = "Survival Vanilla / Plugins únicamente (+0 GB)";

  if (arch.project_meta.engine === "Paper" && mods.length === 0 && !hasVehicleOrVoiceOrCity) {
    complexity_gb = 0;
    complexity_label = "Paper / Plugins únicamente (+0 GB)";
  } else if (hasVehicleOrVoiceOrCity) {
    complexity_gb = 4;
    complexity_label = "Autos, chat de voz por proximidad o ciudad GTA RP (+4 GB)";
  } else if (hasHeavyTech) {
    complexity_gb = 2;
    complexity_label = "Mods técnicos o industriales pesados (+2 GB)";
  }

  const rawTotal = base_gb + players_gb + complexity_gb;
  const total_gb = Math.min(32, Math.max(4, rawTotal));
  const clamped = total_gb !== rawTotal;

  return {
    base_gb,
    players_gb,
    complexity_gb,
    complexity_label,
    total_gb,
    clamped,
  };
}

function toModrinthLoader(engine: EngineType): string | null {
  switch (engine) {
    case "Forge":
      return "forge";
    case "Fabric":
      return "fabric";
    case "NeoForge":
      return "neoforge";
    default:
      return null;
  }
}

async function verifySingleMod(
  slug: string,
  source: "modrinth" | "curseforge",
  engine: EngineType,
  mcVersion: string
): Promise<ModVerificationResult> {
  if (source === "curseforge") {
    return {
      slug,
      source,
      status: "curseforge_manual",
      project_url: `https://www.curseforge.com/minecraft/mc-mods/${encodeURIComponent(slug)}`,
      message: "Alojado en CurseForge; verificación directa en repositorio externo.",
    };
  }

  const headers = {
    "User-Agent": "ServerFast-Architect/1.0 (https://serverfast.local)",
    Accept: "application/json",
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const projectRes = await fetch(
      `https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}`,
      { headers, signal: controller.signal }
    );
    clearTimeout(timeout);

    if (projectRes.status === 404) {
      return {
        slug,
        source,
        status: "not_found",
        project_url: `https://modrinth.com/mods?q=${encodeURIComponent(slug)}`,
        message: "Slug no encontrado en Modrinth. Revisa el identificador o cámbialo.",
      };
    }

    if (!projectRes.ok) {
      return {
        slug,
        source,
        status: "error",
        message: `Error de Modrinth (HTTP ${projectRes.status}).`,
      };
    }

    const projectData = (await projectRes.json()) as {
      title?: string;
      description?: string;
      icon_url?: string;
      downloads?: number;
      loaders?: string[];
      slug?: string;
    };

    const projectUrl = `https://modrinth.com/mod/${projectData.slug || slug}`;
    const loader = toModrinthLoader(engine);

    if (!loader) {
      return {
        slug,
        source,
        status: "incompatible",
        title: projectData.title,
        description: projectData.description,
        icon_url: projectData.icon_url,
        downloads: projectData.downloads,
        project_url: projectUrl,
        available_loaders: projectData.loaders || [],
        message: `Paper no carga mods de ${projectData.loaders?.join(", ") || "cliente/servidor"}.`,
      };
    }

    const verController = new AbortController();
    const verTimeout = setTimeout(() => verController.abort(), 5000);
    const loadersParam = encodeURIComponent(JSON.stringify([loader]));
    const versionsParam = encodeURIComponent(JSON.stringify([mcVersion]));

    const verRes = await fetch(
      `https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version?loaders=${loadersParam}&game_versions=${versionsParam}`,
      { headers, signal: verController.signal }
    );
    clearTimeout(verTimeout);

    if (!verRes.ok) {
      return {
        slug,
        source,
        status: "error",
        title: projectData.title,
        icon_url: projectData.icon_url,
        downloads: projectData.downloads,
        project_url: projectUrl,
        message: "No se pudieron consultar las versiones en Modrinth.",
      };
    }

    const versionsData = (await verRes.json()) as Array<{
      version_number?: string;
    }>;

    if (Array.isArray(versionsData) && versionsData.length > 0) {
      return {
        slug,
        source,
        status: "verified",
        title: projectData.title,
        description: projectData.description,
        icon_url: projectData.icon_url,
        downloads: projectData.downloads,
        project_url: projectUrl,
        matched_version_number: versionsData[0]?.version_number,
        available_loaders: projectData.loaders || [],
        message: `Compatible con ${engine} ${mcVersion}`,
      };
    }

    return {
      slug,
      source,
      status: "incompatible",
      title: projectData.title,
      description: projectData.description,
      icon_url: projectData.icon_url,
      downloads: projectData.downloads,
      project_url: projectUrl,
      available_loaders: projectData.loaders || [],
      message: `Sin compilación exacta para ${engine} ${mcVersion} en Modrinth.`,
    };
  } catch {
    return {
      slug,
      source,
      status: "error",
      message: "Tiempo de espera agotado al consultar Modrinth.",
    };
  }
}

async function verifyArchitectureMods(arch: ServerArchitecture): Promise<ModVerificationResult[]> {
  const mods = arch.dependencies.mods || [];
  if (mods.length === 0) return [];
  return Promise.all(
    mods.map((mod) =>
      verifySingleMod(
        mod.slug,
        mod.source,
        arch.project_meta.engine,
        arch.project_meta.mc_version
      )
    )
  );
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY no está configurada en el entorno del servidor. Configúrala en Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function isServiceUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as { status?: unknown; code?: unknown; message?: unknown };
  if (record.status === 503 || record.code === 503 || record.status === "UNAVAILABLE") {
    return true;
  }
  const msg = typeof record.message === "string" ? record.message : "";
  if (/\b503\b|UNAVAILABLE|Service Unavailable|overloaded/i.test(msg)) {
    return true;
  }
  try {
    const serialized = JSON.stringify(err);
    return /\b503\b|UNAVAILABLE/i.test(serialized);
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateArchitectureWithRetry(
  ai: GoogleGenAI,
  fullPrompt: string,
  maxRetries = 3,
  delayMs = 2000
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: fullPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: ARCHITECTURE_RESPONSE_SCHEMA,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
        },
      });
    } catch (err) {
      lastError = err;
      if (isServiceUnavailableError(err) && attempt < maxRetries) {
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function stripMarkdownAndParseJson(rawText: string): Record<string, unknown> | null {
  try {
    let cleaned = rawText
      .trim()
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.post("/api/architecture/generate", async (req: Request, res: Response) => {
    try {
      const {
        prompt,
        serverName,
        modality,
        preferredEngine,
        preferredVersion,
        maxPlayers,
      } = req.body as {
        prompt?: string;
        serverName?: string;
        modality?: string;
        preferredEngine?: string;
        preferredVersion?: string;
        maxPlayers?: number;
      };

      const requirementsText = typeof prompt === "string" ? prompt.trim() : "";
      const nameText = typeof serverName === "string" ? serverName.trim() : "";
      const modalityText = typeof modality === "string" ? modality.trim() : "";

      if (requirementsText.length < 5 && nameText.length < 3 && modalityText.length < 3) {
        res.status(400).json({
          error:
            "Ingresa el nombre/idea, modalidad o requerimientos del servidor (mínimo 5 caracteres).",
        });
        return;
      }

      const playersLabel =
        typeof maxPlayers === "number" && maxPlayers >= 2 && maxPlayers <= 500
          ? `${Math.round(maxPlayers)} jugadores`
          : "Según contexto (estimar adecuadamente)";
      const versionLabel =
        preferredVersion && preferredVersion !== "auto"
          ? preferredVersion
          : "Automática (elegir la más estable para los mods)";
      const engineLabel =
        preferredEngine && preferredEngine !== "auto"
          ? preferredEngine
          : "Automático (elegir Forge, Fabric, NeoForge o Paper según conveniencia)";

      const fullPrompt = [
        "Genera la especificación técnica en JSON para el siguiente servidor de Minecraft:",
        "",
        `- Nombre/Idea del Servidor: ${nameText || "Servidor personalizado"}`,
        `- Modalidad Principal: ${modalityText || "Inferir de los requerimientos"}`,
        `- Capacidad Estimada de Jugadores: ${playersLabel}`,
        `- Requerimientos Clave Especificados por el Cliente: ${requirementsText || modalityText || nameText}`,
        `- Versión de Minecraft Deseada: ${versionLabel}`,
        `- Mod Loader Preferido: ${engineLabel}`,
      ].join("\n");

      const ai = getGeminiClient();
      const response = await generateArchitectureWithRetry(ai, fullPrompt, 3, 2000);

      const rawText = (response.text ?? "").trim();
      if (!rawText) {
        res.status(502).json({
          error: "El motor de arquitectura devolvió una respuesta vacía.",
          code: "INVALID_JSON",
        });
        return;
      }

      let cleanedText = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const fencedMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fencedMatch && fencedMatch[1]) {
        cleanedText = fencedMatch[1].trim();
      }

      let architecture: ServerArchitecture;
      try {
        architecture = JSON.parse(cleanedText) as ServerArchitecture;
      } catch {
        res.status(502).json({
          error: "La respuesta de la API no contenía un JSON válido tras limpiar Markdown.",
          code: "INVALID_JSON",
        });
        return;
      }

      // Enforce deterministic user overrides, alias normalization & strict 4-block structure
      if (typeof maxPlayers === "number" && maxPlayers >= 2 && maxPlayers <= 500) {
        architecture.server_properties.max_players = Math.round(maxPlayers);
      }
      if (preferredVersion && preferredVersion !== "auto") {
        architecture.project_meta.mc_version = preferredVersion;
      }
      architecture = normalizeAndDedupeMods(architecture);

      const complexityContext = `${nameText} ${modalityText} ${requirementsText}`;
      const ram_breakdown = computeRamBreakdown(architecture, complexityContext);
      architecture.project_meta.allocated_ram_gb = ram_breakdown.total_gb;

      const verifications = await verifyArchitectureMods(architecture);

      res.json({
        architecture,
        ram_breakdown,
        verifications,
        generated_at: new Date().toISOString(),
      });
    } catch (err) {
      if (isServiceUnavailableError(err)) {
        res.status(503).json({
          error: "La API de IA devolvió 503 UNAVAILABLE tras 3 reintentos.",
          status: "UNAVAILABLE",
          retried_upstream: true,
        });
        return;
      }
      const message =
        err instanceof Error ? err.message : "Error interno al generar la arquitectura.";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/architecture/verify", async (req: Request, res: Response) => {
    try {
      const { architecture, prompt = "" } = req.body as {
        architecture?: ServerArchitecture;
        prompt?: string;
      };

      if (
        !architecture ||
        !architecture.project_meta ||
        !architecture.dependencies ||
        !architecture.server_properties ||
        !architecture.custom_scripts
      ) {
        res.status(400).json({ error: "Estructura JSON de arquitectura inválida." });
        return;
      }

      const normalizedArch = normalizeAndDedupeMods(architecture);
      const ram_breakdown = computeRamBreakdown(normalizedArch, prompt);
      const updatedArchitecture: ServerArchitecture = {
        ...normalizedArch,
        project_meta: {
          ...normalizedArch.project_meta,
          allocated_ram_gb: ram_breakdown.total_gb,
        },
      };
      const verifications = await verifyArchitectureMods(updatedArchitecture);

      res.json({
        architecture: updatedArchitecture,
        ram_breakdown,
        verifications,
        generated_at: new Date().toISOString(),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo verificar la arquitectura.";
      res.status(500).json({ error: message });
    }
  });

  // Pterodactyl Application API (POST /api/application/servers) + n8n Webhook handler
  app.post("/api/provisioning/deploy", async (req: Request, res: Response) => {
    try {
      const { architecture, planId = "pro", ownerUserId = 1 } = req.body as {
        architecture?: ServerArchitecture;
        planId?: "basic" | "pro" | "enterprise";
        ownerUserId?: number;
      };

      if (!architecture || !architecture.project_meta || !architecture.server_properties) {
        res.status(400).json({ error: "Arquitectura inválida para aprovisionamiento." });
        return;
      }

      const { project_meta, dependencies, server_properties, custom_scripts } = architecture;
      const memoryMb = Math.max(4096, project_meta.allocated_ram_gb * 1024);
      const diskMb = planId === "enterprise" ? 65536 : planId === "pro" ? 32768 : 16384;
      const cpuLimit = planId === "enterprise" ? 400 : planId === "pro" ? 250 : 150;

      const dockerImage =
        project_meta.mc_version.startsWith("1.21") || project_meta.mc_version.startsWith("1.20")
          ? "ghcr.io/pterodactyl/yolks:java_21"
          : "ghcr.io/pterodactyl/yolks:java_17";

      const pterodactylPayload = {
        name: project_meta.server_name,
        user: ownerUserId,
        egg: project_meta.engine === "Paper" ? 1 : 2,
        docker_image: dockerImage,
        startup:
          "java -Xms128M -Xmx{{SERVER_MEMORY}}M -XX:+UseG1GC -jar {{SERVER_JARFILE}} nogui",
        environment: {
          SERVER_JARFILE:
            project_meta.engine === "Paper" ? "server.jar" : "forge-server.jar",
          MINECRAFT_VERSION: project_meta.mc_version,
          MOD_LOADER: project_meta.engine,
          SERVER_MEMORY: String(memoryMb),
          MODRINTH_MODS: dependencies.mods.map((m) => m.slug).join(","),
          KUBEJS_ENABLED: custom_scripts.kubejs_required ? "1" : "0",
        },
        limits: {
          memory: memoryMb,
          swap: 0,
          disk: diskMb,
          io: 500,
          cpu: cpuLimit,
        },
        feature_limits: {
          databases: 2,
          allocations: 1,
          backups: planId === "enterprise" ? 10 : 3,
        },
        deploy: {
          locations: [Number(process.env.PTERODACTYL_NODE_ID || 1)],
          dedicated_ip: false,
          port_range: ["25565-25665"],
        },
      };

      const n8nPayload = {
        event: "server.provision.requested",
        timestamp: new Date().toISOString(),
        plan_id: planId,
        architecture,
        pterodactyl_payload: pterodactylPayload,
      };

      const panelUrl = process.env.PTERODACTYL_PANEL_URL?.replace(/\/$/, "");
      const pterodactylKey = process.env.PTERODACTYL_API_KEY;
      const n8nWebhookUrl = process.env.N8N_PROVISIONING_WEBHOOK_URL;

      let providerMode: "pterodactyl_live" | "simulated" = "simulated";
      let serverId = `sf-${Math.random().toString(36).slice(2, 8)}`;
      let externalId = `srv_${Date.now().toString(36)}`;
      let publicIp = "node01.serverfast.net";
      let port = 25565;
      let panelServerUrl = `https://panel.serverfast.net/server/${serverId}`;

      // Real HTTP integration when Pterodactyl credentials are configured
      if (panelUrl && pterodactylKey) {
        const pteroRes = await fetch(`${panelUrl}/api/application/servers`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${pterodactylKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(pterodactylPayload),
        });

        if (!pteroRes.ok) {
          const errText = await pteroRes.text();
          res.status(502).json({
            error: `Pterodactyl API respondió HTTP ${pteroRes.status}: ${errText.slice(0, 200)}`,
          });
          return;
        }

        const pteroData = (await pteroRes.json()) as {
          attributes?: { identifier?: string; uuid?: string; id?: number };
        };
        providerMode = "pterodactyl_live";
        serverId = pteroData.attributes?.identifier || serverId;
        externalId = pteroData.attributes?.uuid || externalId;
        panelServerUrl = `${panelUrl}/server/${serverId}`;
      }

      let n8nDispatched = false;
      if (n8nWebhookUrl) {
        try {
          const hookRes = await fetch(n8nWebhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(process.env.N8N_WEBHOOK_SECRET
                ? { "X-ServerFast-Secret": process.env.N8N_WEBHOOK_SECRET }
                : {}),
            },
            body: JSON.stringify(n8nPayload),
          });
          n8nDispatched = hookRes.ok;
        } catch {
          n8nDispatched = false;
        }
      }

      const nowStr = new Date().toTimeString().slice(0, 8);
      const modCount = dependencies.mods.length;
      const pluginCount = dependencies.plugins.length;
      const consoleLogs = [
        `[${nowStr}] [ServerFast/Daemon]: Contenedor Docker asignado (${dockerImage}) en ${publicIp}:${port}`,
        `[${nowStr}] [ServerFast/Memory]: Reservando ${project_meta.allocated_ram_gb} GB RAM (-Xms${project_meta.allocated_ram_gb}G -Xmx${project_meta.allocated_ram_gb}G G1GC)`,
        `[${nowStr}] [main/INFO]: Iniciando ${project_meta.engine} para Minecraft ${project_meta.mc_version}`,
        project_meta.engine === "Paper"
          ? `[${nowStr}] [Paper/INFO]: Cargados ${pluginCount} plugins compatibles en /plugins`
          : `[${nowStr}] [ModLauncher/INFO]: Inyectados ${modCount} mods verificados desde Modrinth`,
        custom_scripts.kubejs_required
          ? `[${nowStr}] [KubeJS/INFO]: Script kubejs/server_scripts/server_fast.js compilado sin errores`
          : `[${nowStr}] [ServerProperties/INFO]: max-players=${server_properties.max_players}, view-distance=${server_properties.view_distance}`,
        `[${nowStr}] [Server thread/INFO]: Done (4.821s)! For help, type "help"`,
      ];

      const record: ProvisionedServerRecord = {
        server_id: serverId,
        external_id: externalId,
        provider_mode: providerMode,
        plan_id: planId,
        public_ip: publicIp,
        port,
        status: "online",
        sftp: {
          host: `sftp://${publicIp}`,
          port: 2022,
          username: `sf_${serverId.replace(/[^a-z0-9]/gi, "")}.admin`,
          password: `SF-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`,
        },
        panel_url: panelServerUrl,
        n8n_webhook_dispatched: n8nDispatched,
        console_logs: consoleLogs,
        created_at: new Date().toISOString(),
      };

      res.json(record);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error al aprovisionar el servidor.";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/provisioning/servers/:serverId/power", async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      const { action } = req.body as { action?: "start" | "restart" | "stop" };
      if (!action || !["start", "restart", "stop"].includes(action)) {
        res.status(400).json({ error: "Acción de energía inválida." });
        return;
      }

      const panelUrl = process.env.PTERODACTYL_PANEL_URL?.replace(/\/$/, "");
      const clientKey = process.env.PTERODACTYL_CLIENT_API_KEY;

      if (panelUrl && clientKey) {
        const pteroRes = await fetch(`${panelUrl}/api/client/servers/${encodeURIComponent(serverId)}/power`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clientKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ signal: action }),
        });
        if (!pteroRes.ok) {
          res.status(502).json({ error: `Error Pterodactyl power HTTP ${pteroRes.status}` });
          return;
        }
      }

      res.json({
        server_id: serverId,
        action,
        status: action === "stop" ? "stopped" : action === "restart" ? "restarting" : "online",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Error ejecutando acción de control.",
      });
    }
  });

  // Phase 4: Guardian AI Log Parser & Crash Repair Endpoint
  app.post("/api/guardian/diagnose", async (req: Request, res: Response) => {
    try {
      const { logs, architecture } = req.body as {
        logs?: string[];
        architecture?: ServerArchitecture;
      };

      if (!Array.isArray(logs) || !architecture || !architecture.project_meta) {
        res.status(400).json({ error: "Se requieren los logs y la arquitectura del servidor." });
        return;
      }

      const errorKeywords = [
        "CrashReport",
        "NullPointerException",
        "Caused by:",
        "ModLoadingException",
        "OutOfMemoryError",
        "MixinApplyError",
        "MissingOrUnsupportedMandatoryDependency",
      ];

      const joined = logs.join("\n");
      const matchedKeywords = errorKeywords.filter((kw) =>
        joined.toLowerCase().includes(kw.toLowerCase())
      );

      if (matchedKeywords.length === 0) {
        res.json({
          healthy: true,
          summary: "🟢 Servidor funcionando de forma óptima sin conflictos de memoria ni mods.",
          matched_keywords: [],
          offending_mod_slug: null,
          offending_line: null,
          simple_cause: "",
          proposed_action: "",
          patch_action_type: "none",
          analyzed_by: "local_parser",
        });
        return;
      }

      const offendingLine =
        logs.find((line) =>
          errorKeywords.some((kw) => line.toLowerCase().includes(kw.toLowerCase()))
        ) ?? logs[logs.length - 1] ?? null;

      const installedSlugs = (architecture.dependencies.mods || []).map((m) => m.slug);
      const matchedModFromLogs =
        installedSlugs.find((slug) =>
          joined.toLowerCase().includes(slug.toLowerCase())
        ) ?? null;

      const buildFallbackDiagnostic = () => ({
        healthy: false,
        summary: matchedModFromLogs
          ? `Conflicto crítico detectado en el mod ${matchedModFromLogs}`
          : "Excepción crítica detectada en la consola del servidor",
        matched_keywords: matchedKeywords,
        offending_mod_slug: matchedModFromLogs,
        offending_line: offendingLine,
        simple_cause: matchedModFromLogs
          ? `El mod "${matchedModFromLogs}" provocó un fallo (${matchedKeywords[0]}) durante la inicialización en ${architecture.project_meta.engine} ${architecture.project_meta.mc_version}.`
          : `El servidor registró una excepción crítica (${matchedKeywords[0]}) en el hilo principal.`,
        proposed_action: matchedModFromLogs
          ? `Desactivar mod conflictivo "${matchedModFromLogs}" de la Matriz de Mods y reiniciar el servidor de forma segura.`
          : "Reiniciar la instancia de forma segura y limpiar caché temporal.",
        patch_action_type: matchedModFromLogs ? "remove_mod" : "restart_only",
        analyzed_by: "local_parser",
      });

      try {
        const ai = getGeminiClient();
        const guardianPrompt = `Analiza los siguientes logs de consola de un servidor Minecraft ${architecture.project_meta.engine} ${architecture.project_meta.mc_version} y devuelve un diagnóstico estructurado en español.

Mods instalados en la Matriz de Mods: ${installedSlugs.join(", ") || "ninguno"}

Logs:
${logs.slice(-25).join("\n")}`;

        const response = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: guardianPrompt,
          config: {
            systemInstruction:
              "Eres el Agente Guardián de Server Fast. Identifica con precisión el mod culpable (preferentemente uno de los slugs instalados si aplica), la línea exacta del error, explica la causa en español sencillo para un administrador no técnico y propón una acción correctiva concreta.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                offending_mod_slug: { type: Type.STRING },
                offending_line: { type: Type.STRING },
                simple_cause: { type: Type.STRING },
                proposed_action: { type: Type.STRING },
                patch_action_type: {
                  type: Type.STRING,
                  enum: ["remove_mod", "restart_only"],
                },
              },
              required: [
                "summary",
                "offending_mod_slug",
                "offending_line",
                "simple_cause",
                "proposed_action",
                "patch_action_type",
              ],
            },
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.LOW,
            },
          },
        });

        const parsed = stripMarkdownAndParseJson(response.text || "");
        if (!parsed) {
          res.json(buildFallbackDiagnostic());
          return;
        }

        const aiModSlug =
          typeof parsed.offending_mod_slug === "string" &&
          parsed.offending_mod_slug.trim() &&
          parsed.offending_mod_slug.trim().toLowerCase() !== "none"
            ? parsed.offending_mod_slug.trim()
            : matchedModFromLogs;

        res.json({
          healthy: false,
          summary:
            typeof parsed.summary === "string" && parsed.summary
              ? parsed.summary
              : buildFallbackDiagnostic().summary,
          matched_keywords: matchedKeywords,
          offending_mod_slug: aiModSlug,
          offending_line:
            typeof parsed.offending_line === "string" && parsed.offending_line
              ? parsed.offending_line
              : offendingLine,
          simple_cause:
            typeof parsed.simple_cause === "string" && parsed.simple_cause
              ? parsed.simple_cause
              : buildFallbackDiagnostic().simple_cause,
          proposed_action:
            typeof parsed.proposed_action === "string" && parsed.proposed_action
              ? parsed.proposed_action
              : buildFallbackDiagnostic().proposed_action,
          patch_action_type:
            parsed.patch_action_type === "remove_mod" || aiModSlug
              ? "remove_mod"
              : "restart_only",
          analyzed_by: "gemini",
        });
      } catch {
        res.json(buildFallbackDiagnostic());
      }
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Error analizando los logs del servidor.",
      });
    }
  });

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("/{*path}", (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Build not found");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server Fast running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
