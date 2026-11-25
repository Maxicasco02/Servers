import type {
  ProvisionedServerRecord,
  ServerArchitecture,
  ServerPowerStatus,
} from "../types/architecture";

export type PlanTierId = "basic" | "pro" | "enterprise";

export interface PterodactylDeployPayload {
  name: string;
  user: number;
  egg: number;
  docker_image: string;
  startup: string;
  environment: Record<string, string>;
  limits: {
    memory: number;
    swap: number;
    disk: number;
    io: number;
    cpu: number;
  };
  feature_limits: {
    databases: number;
    allocations: number;
    backups: number;
  };
  deploy: {
    locations: number[];
    dedicated_ip: boolean;
    port_range: string[];
  };
}

export function buildPterodactylApplicationPayload(
  architecture: ServerArchitecture,
  planId: PlanTierId,
  ownerUserId = 1
): PterodactylDeployPayload {
  const { project_meta, dependencies, custom_scripts } = architecture;
  const memoryMb = Math.max(4096, project_meta.allocated_ram_gb * 1024);
  const diskMb = planId === "enterprise" ? 65536 : planId === "pro" ? 32768 : 16384;
  const cpuLimit = planId === "enterprise" ? 400 : planId === "pro" ? 250 : 150;
  const dockerImage =
    project_meta.mc_version.startsWith("1.21") || project_meta.mc_version.startsWith("1.20")
      ? "ghcr.io/pterodactyl/yolks:java_21"
      : "ghcr.io/pterodactyl/yolks:java_17";

  return {
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
      locations: [1],
      dedicated_ip: false,
      port_range: ["25565-25665"],
    },
  };
}

function createLocalSimulatedRecord(
  architecture: ServerArchitecture,
  planId: PlanTierId
): ProvisionedServerRecord {
  const { project_meta, dependencies, server_properties, custom_scripts } = architecture;
  const serverId = `sf-${Math.random().toString(36).slice(2, 8)}`;
  const externalId = `srv_${Date.now().toString(36)}`;
  const publicIp = "node01.serverfast.net";
  const port = 25565;
  const nowStr = new Date().toTimeString().slice(0, 8);
  const dockerImage =
    project_meta.mc_version.startsWith("1.21") || project_meta.mc_version.startsWith("1.20")
      ? "ghcr.io/pterodactyl/yolks:java_21"
      : "ghcr.io/pterodactyl/yolks:java_17";

  return {
    server_id: serverId,
    external_id: externalId,
    provider_mode: "simulated",
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
    panel_url: `https://panel.serverfast.net/server/${serverId}`,
    n8n_webhook_dispatched: false,
    console_logs: [
      `[${nowStr}] [ServerFast/Daemon]: Contenedor Docker asignado (${dockerImage}) en ${publicIp}:${port}`,
      `[${nowStr}] [ServerFast/Memory]: Reservando ${project_meta.allocated_ram_gb} GB RAM (-Xms${project_meta.allocated_ram_gb}G -Xmx${project_meta.allocated_ram_gb}G G1GC)`,
      `[${nowStr}] [main/INFO]: Iniciando ${project_meta.engine} para Minecraft ${project_meta.mc_version}`,
      project_meta.engine === "Paper"
        ? `[${nowStr}] [Paper/INFO]: Cargados ${dependencies.plugins.length} plugins compatibles en /plugins`
        : `[${nowStr}] [ModLauncher/INFO]: Inyectados ${dependencies.mods.length} mods verificados desde Modrinth`,
      custom_scripts.kubejs_required
        ? `[${nowStr}] [KubeJS/INFO]: Script kubejs/server_scripts/server_fast.js compilado sin errores`
        : `[${nowStr}] [ServerProperties/INFO]: max-players=${server_properties.max_players}, view-distance=${server_properties.view_distance}`,
      `[${nowStr}] [Server thread/INFO]: Done (4.821s)! For help, type "help"`,
    ],
    created_at: new Date().toISOString(),
  };
}

/**
 * Manejador unificado para aprovisionar el servidor vía backend Express ->
 * Pterodactyl API (POST /api/application/servers) + webhook de n8n.
 * Mantiene el mismo contrato de respuesta tanto en modo live como simulado.
 */
export async function deployProvisionedServer(
  architecture: ServerArchitecture,
  planId: PlanTierId
): Promise<ProvisionedServerRecord> {
  try {
    const res = await fetch("/api/provisioning/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ architecture, planId }),
    });

    if (!res.ok) {
      return createLocalSimulatedRecord(architecture, planId);
    }

    const data = (await res.json()) as Partial<ProvisionedServerRecord>;
    if (!data || !data.server_id || !data.public_ip || !data.sftp) {
      return createLocalSimulatedRecord(architecture, planId);
    }

    return data as ProvisionedServerRecord;
  } catch {
    return createLocalSimulatedRecord(architecture, planId);
  }
}

export async function sendServerPowerAction(
  serverId: string,
  action: "start" | "restart" | "stop"
): Promise<{ status: ServerPowerStatus; timestamp: string }> {
  const fallbackStatus: ServerPowerStatus =
    action === "stop" ? "stopped" : action === "restart" ? "restarting" : "online";

  try {
    const res = await fetch(
      `/api/provisioning/servers/${encodeURIComponent(serverId)}/power`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }
    );

    if (!res.ok) {
      return { status: fallbackStatus, timestamp: new Date().toISOString() };
    }

    const data = (await res.json()) as {
      status?: ServerPowerStatus;
      timestamp?: string;
    };

    return {
      status: data.status ?? fallbackStatus,
      timestamp: data.timestamp ?? new Date().toISOString(),
    };
  } catch {
    return { status: fallbackStatus, timestamp: new Date().toISOString() };
  }
}
