export type EngineType = "Forge" | "Fabric" | "NeoForge" | "Paper";
export type ModSource = "modrinth" | "curseforge";
export type ModCategory = string;
export type GamemodeType = "survival" | "creative" | "adventure";

export interface ModDependency {
  slug: string;
  source: ModSource;
  category: ModCategory;
}

export interface ServerArchitecture {
  project_meta: {
    server_name: string;
    engine: EngineType;
    mc_version: string;
    allocated_ram_gb: number;
  };
  dependencies: {
    mods: ModDependency[];
    plugins: string[];
  };
  server_properties: {
    gamemode: GamemodeType;
    pvp: boolean;
    max_players: number;
    online_mode: boolean;
    view_distance: number;
  };
  custom_scripts: {
    kubejs_required: boolean;
    script_intent: string;
  };
}

export interface RamBreakdown {
  base_gb: number;
  players_gb: number;
  complexity_gb: number;
  complexity_label: string;
  total_gb: number;
  clamped: boolean;
}

export interface ModVerificationResult {
  slug: string;
  source: ModSource;
  status: "verified" | "incompatible" | "not_found" | "curseforge_manual" | "error";
  title?: string;
  description?: string;
  icon_url?: string;
  downloads?: number;
  project_url?: string;
  matched_version_number?: string;
  available_loaders?: string[];
  message: string;
}

export interface ArchitectureBundle {
  architecture: ServerArchitecture;
  ram_breakdown: RamBreakdown;
  verifications: ModVerificationResult[];
  generated_at: string;
  isFallback?: boolean;
  fallbackReason?: string;
}

export interface ServerSpecInputs {
  serverName: string;
  modality: string;
  maxPlayers: string;
  requirements: string;
  preferredVersion: string;
  preferredEngine: string;
}

export interface SavedArchitecture extends ArchitectureBundle {
  id: string;
  prompt: string;
  specInputs?: ServerSpecInputs;
  provisionedServer?: ProvisionedServerRecord;
}

export type ServerPowerStatus = "online" | "restarting" | "stopped";

export interface ProvisionedServerRecord {
  server_id: string;
  external_id: string;
  provider_mode: "pterodactyl_live" | "simulated";
  plan_id: "basic" | "pro" | "enterprise";
  public_ip: string;
  port: number;
  status: ServerPowerStatus;
  sftp: {
    host: string;
    port: number;
    username: string;
    password: string;
  };
  panel_url: string;
  n8n_webhook_dispatched: boolean;
  console_logs: string[];
  created_at: string;
}

export interface LogDiagnosticResult {
  healthy: boolean;
  summary: string;
  matched_keywords: string[];
  offending_mod_slug: string | null;
  offending_line: string | null;
  simple_cause: string;
  proposed_action: string;
  patch_action_type: "remove_mod" | "restart_only" | "none";
  analyzed_by: "gemini" | "local_parser";
}

