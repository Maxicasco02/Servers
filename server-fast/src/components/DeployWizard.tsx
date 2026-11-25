import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Rocket,
  SlidersHorizontal,
} from "lucide-react";
import type { ServerSpecInputs } from "../types/architecture";
import type { PlanTierId } from "../lib/provisioningService";

interface DeployWizardProps {
  isGenerating: boolean;
  retryStatus?: string | null;
  error: string | null;
  onDeploy: (
    spec: ServerSpecInputs,
    planId: PlanTierId,
    estimatedRamGb: number
  ) => void;
}

interface ModalityOption {
  id: string;
  title: string;
  modalityValue: string;
  defaultServerName: string;
  subtitle: string;
  recommendedEngine: string;
  recommendedVersion: string;
  imageUrl: string;
  defaultFeatures: string[];
  heavyTier: "rp" | "tech" | "vanilla";
}

interface FeatureOption {
  id: string;
  label: string;
  detail: string;
  promptPhrase: string;
  addsHeavyRpCost?: boolean;
  addsTechCost?: boolean;
}

interface PricingPlan {
  id: "basic" | "pro" | "enterprise";
  name: string;
  priceMonthly: number;
  audience: string;
  playerLimit: string;
  ramRange: string;
  engineSupport: string;
  extras: string;
}

const MODALITY_OPTIONS: ModalityOption[] = [
  {
    id: "gta-rp",
    title: "GTA RP",
    modalityValue: "GTA V Roleplay",
    defaultServerName: "Server Fast GTA RP",
    subtitle: "Ciudad urbana, vehículos, licencias y trabajos de rol.",
    recommendedEngine: "Forge",
    recommendedVersion: "1.20.1",
    imageUrl: "/src/assets/images/modality_gta_rp_1795627659538.jpg",
    defaultFeatures: ["voice", "vehicles", "economy", "city_map", "rp_jobs"],
    heavyTier: "rp",
  },
  {
    id: "industrial",
    title: "Survival Industrial",
    modalityValue: "Survival Técnico e Industrial",
    defaultServerName: "TechCraft Automation",
    subtitle: "Maquinaria Create, energía eléctrica y almacenamiento digital.",
    recommendedEngine: "Forge",
    recommendedVersion: "1.20.1",
    imageUrl: "/src/assets/images/modality_industrial_1795627660331.jpg",
    defaultFeatures: ["create_energy", "ae2_storage", "minimap", "tps_opt"],
    heavyTier: "tech",
  },
  {
    id: "rpg",
    title: "RPG",
    modalityValue: "RPG Fantasía Medieval",
    defaultServerName: "Reinos de Eldoria RPG",
    subtitle: "Clases personalizadas, mazmorras, biomas y misiones.",
    recommendedEngine: "Fabric",
    recommendedVersion: "1.20.1",
    imageUrl: "/src/assets/images/modality_rpg_1795627659340.jpg",
    defaultFeatures: ["voice", "rpg_quests", "minimap", "claims"],
    heavyTier: "rp",
  },
  {
    id: "vanilla-plus",
    title: "Vanilla+",
    modalityValue: "Survival Vanilla+",
    defaultServerName: "Atlas Survival Plus",
    subtitle: "Experiencia clásica optimizada con calidad de vida y clanes.",
    recommendedEngine: "Paper",
    recommendedVersion: "1.20.1",
    imageUrl: "/src/assets/images/modality_vanilla_1795627660354.jpg",
    defaultFeatures: ["economy", "claims", "tps_opt"],
    heavyTier: "vanilla",
  },
];

const FEATURE_OPTIONS: FeatureOption[] = [
  {
    id: "voice",
    label: "Chat de voz por proximidad",
    detail: "Audio posicional 3D integrado dentro del juego.",
    promptPhrase: "Chat de voz por proximidad",
    addsHeavyRpCost: true,
  },
  {
    id: "vehicles",
    label: "Vehículos y licencias de conducir",
    detail: "Autos conducibles, combustible y control de licencias.",
    promptPhrase: "Vehículos funcionales y licencias de conducir",
    addsHeavyRpCost: true,
  },
  {
    id: "economy",
    label: "Sistema de economía y bancos",
    detail: "Moneda física/digital, cajeros y cuentas bancarias.",
    promptPhrase: "Sistema de economía con bancos",
  },
  {
    id: "city_map",
    label: "Mapa urbano custom",
    detail: "Generación de ciudad moderna con edificios y avenidas.",
    promptPhrase: "Mapa urbano custom",
    addsHeavyRpCost: true,
  },
  {
    id: "rp_jobs",
    label: "Trabajos de policía y médicos",
    detail: "Roles de servicio, multas, arrestos y reanimación.",
    promptPhrase: "Trabajo de policía y médicos",
  },
  {
    id: "create_energy",
    label: "Maquinaria Create y energía",
    detail: "Automatización mecánica, generadores y redes eléctricas.",
    promptPhrase: "Maquinaria automatizada Create y generación de energía eléctrica",
    addsTechCost: true,
  },
  {
    id: "ae2_storage",
    label: "Almacenamiento digital masivo",
    detail: "Redes de autocrafteo y terminales de ítems.",
    promptPhrase: "Redes de almacenamiento digital masivo",
    addsTechCost: true,
  },
  {
    id: "rpg_quests",
    label: "Clases RPG y misiones custom",
    detail: "Progresión por clases y lógica de eventos en KubeJS.",
    promptPhrase: "Sistema personalizado de clases RPG, mazmorras y misiones",
  },
  {
    id: "minimap",
    label: "Minimapa integrado",
    detail: "Navegación en pantalla y mapa del mundo con waypoints.",
    promptPhrase: "Minimapa integrado",
  },
  {
    id: "claims",
    label: "Protección de terrenos y clanes",
    detail: "Zonas protegidas por equipo y control de permisos.",
    promptPhrase: "Protección de terrenos y clanes",
  },
  {
    id: "tps_opt",
    label: "Optimización avanzada de TPS",
    detail: "Reducción de memoria RAM y perfilado de rendimiento.",
    promptPhrase: "Optimización avanzada de TPS y memoria",
  },
];

const PRICING_PLANS: PricingPlan[] = [
  {
    id: "basic",
    name: "Basic",
    priceMonthly: 29,
    audience: "Para grupos de amigos y Survival ligero",
    playerLimit: "Hasta 25 jugadores",
    ramRange: "4 GB – 6 GB RAM DDR5",
    engineSupport: "Paper o Fabric ligero",
    extras: "Verificación Modrinth · Soporte estándar",
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 69,
    audience: "Para servidores con mods, Create o Roleplay",
    playerLimit: "Hasta 60 jugadores",
    ramRange: "8 GB – 16 GB RAM DDR5",
    engineSupport: "Forge, NeoForge o Fabric + KubeJS",
    extras: "Backups diarios · Scripts de arranque optimizados",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: 149,
    audience: "Para redes masivas y eventos GTA RP",
    playerLimit: "100+ jugadores simultáneos",
    ramRange: "16 GB – 32 GB RAM DDR5",
    engineSupport: "CPU dedicada de alta frecuencia + KubeJS",
    extras: "Soporte prioritario · Mitigación DDoS dedicada",
  },
];

const STEP_LABELS = [
  { num: 1, title: "01. Modalidad" },
  { num: 2, title: "02. Jugadores y Recursos" },
  { num: 3, title: "03. Requerimientos" },
  { num: 4, title: "04. Plan y Despliegue" },
] as const;

export function DeployWizard({
  isGenerating,
  retryStatus,
  error,
  onDeploy,
}: DeployWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [selectedModalityId, setSelectedModalityId] = useState<string>("gta-rp");
  const [serverName, setServerName] = useState<string>("Server Fast GTA RP");
  const [playerCount, setPlayerCount] = useState<number>(50);
  const [preferredEngine, setPreferredEngine] = useState<string>("Forge");
  const [preferredVersion, setPreferredVersion] = useState<string>("1.20.1");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([
    "voice",
    "vehicles",
    "economy",
    "city_map",
    "rp_jobs",
  ]);
  const [extraNotes, setExtraNotes] = useState<string>("");
  const [selectedPlanOverride, setSelectedPlanOverride] = useState<
    "basic" | "pro" | "enterprise" | null
  >(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const selectedModality = useMemo(
    () =>
      MODALITY_OPTIONS.find((m) => m.id === selectedModalityId) ??
      MODALITY_OPTIONS[0],
    [selectedModalityId]
  );

  const ramEstimate = useMemo(() => {
    const base = 4;
    const extraPlayers = Math.max(0, playerCount - 10);
    const playersGb =
      extraPlayers === 0 ? 0 : Math.ceil(extraPlayers / 25) * 2;

    const chosenObjs = FEATURE_OPTIONS.filter((f) =>
      selectedFeatures.includes(f.id)
    );
    const hasHeavyRp =
      preferredEngine !== "Paper" &&
      (selectedModality.heavyTier === "rp" ||
        chosenObjs.some((f) => f.addsHeavyRpCost));
    const hasHeavyTech =
      preferredEngine !== "Paper" &&
      (selectedModality.heavyTier === "tech" ||
        chosenObjs.some((f) => f.addsTechCost));

    let complexityGb = 0;
    let complexityReason = "Vanilla / Plugins únicamente (+0 GB)";
    if (hasHeavyRp) {
      complexityGb = 4;
      complexityReason = "Vehículos, voz o mapa urbano RP (+4 GB)";
    } else if (hasHeavyTech) {
      complexityGb = 2;
      complexityReason = "Mods técnicos/industriales pesados (+2 GB)";
    }

    const total = Math.min(32, Math.max(4, base + playersGb + complexityGb));
    return {
      base,
      playersGb,
      complexityGb,
      complexityReason,
      total,
    };
  }, [playerCount, selectedFeatures, selectedModality, preferredEngine]);

  const recommendedPlanId: "basic" | "pro" | "enterprise" = useMemo(() => {
    if (playerCount > 60 || ramEstimate.total > 16) return "enterprise";
    if (playerCount > 25 || ramEstimate.total > 6 || preferredEngine !== "Paper") {
      return "pro";
    }
    return "basic";
  }, [playerCount, ramEstimate.total, preferredEngine]);

  const activePlanId = selectedPlanOverride ?? recommendedPlanId;
  const activePlan =
    PRICING_PLANS.find((p) => p.id === activePlanId) ?? PRICING_PLANS[1];

  const handleSelectModality = (option: ModalityOption) => {
    setSelectedModalityId(option.id);
    setServerName(option.defaultServerName);
    setPreferredEngine(option.recommendedEngine);
    setPreferredVersion(option.recommendedVersion);
    setSelectedFeatures(option.defaultFeatures);
    setSelectedPlanOverride(null);
  };

  const toggleFeature = (id: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const goToStep = (next: 1 | 2 | 3 | 4) => {
    setDirection(next >= step ? 1 : -1);
    setStep(next);
  };

  const handleDeployClick = () => {
    const featurePhrases = FEATURE_OPTIONS.filter((f) =>
      selectedFeatures.includes(f.id)
    ).map((f) => f.promptPhrase);

    const combinedRequirements = [
      ...featurePhrases,
      extraNotes.trim(),
    ]
      .filter(Boolean)
      .join(", ");

    const spec: ServerSpecInputs = {
      serverName: serverName.trim() || selectedModality.defaultServerName,
      modality: selectedModality.modalityValue,
      maxPlayers: String(playerCount >= 100 ? Math.max(100, playerCount) : playerCount),
      requirements:
        combinedRequirements || selectedModality.subtitle,
      preferredVersion,
      preferredEngine,
    };

    onDeploy(spec, activePlan.id, ramEstimate.total);
  };

  return (
    <section
      id="architect"
      aria-label="Asistente de configuración de servidor"
      className="border-b border-[#1E293B] bg-[#0E161F] px-6 py-7"
    >
      <div className="mx-auto max-w-[1160px]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-100 text-balance">
              Configura y despliega tu servidor de Minecraft
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">
              Elige la modalidad, ajusta la capacidad de jugadores y selecciona las mecánicas. Nuestra IA compila una arquitectura compatible al instante.
            </p>
          </div>
          <div className="font-mono text-xs text-slate-400 tabular-nums shrink-0">
            Paso {step} de 4 · RAM estimada:{" "}
            <span className="font-semibold text-emerald-400">
              {ramEstimate.total} GB
            </span>
          </div>
        </div>

        {/* Stepper Bar */}
        <div
          role="navigation"
          aria-label="Pasos del asistente"
          className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {STEP_LABELS.map((s) => {
            const isCurrent = step === s.num;
            const isDone = step > s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => goToStep(s.num)}
                className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-xs font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500 ${
                  isCurrent
                    ? "border-emerald-500/70 bg-[#15222E] text-slate-100"
                    : isDone
                      ? "border-[#1E293B] bg-[#111923] text-emerald-400 hover:border-slate-600"
                      : "border-[#1E293B] bg-[#0B1117] text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <span className="truncate">{s.title}</span>
                {isDone && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        {/* Animated Step Viewport */}
        <div className="mt-5 overflow-hidden rounded-xl border border-[#1E293B] bg-[#111923] p-6">
          <AnimatePresence mode="wait" initial={false}>
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: direction * 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -18 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-slate-100">
                      01. Elige la modalidad principal
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      Cada plantilla preconfigura el motor, la versión de Minecraft y los mods recomendados.
                    </p>
                  </div>

                  <div className="w-full sm:w-72">
                    <label
                      htmlFor="wizard-server-name"
                      className="block text-xs font-medium text-slate-400"
                    >
                      Nombre de tu servidor
                    </label>
                    <input
                      id="wizard-server-name"
                      type="text"
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                      placeholder="Ej.: Server Fast GTA RP"
                      className="mt-1 w-full rounded-md border border-[#1E293B] bg-[#0B1117] px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {MODALITY_OPTIONS.map((option) => {
                    const isSelected = selectedModalityId === option.id;
                    const imgFailed = failedImages[option.id];
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleSelectModality(option)}
                        aria-pressed={isSelected}
                        className={`group flex flex-col overflow-hidden rounded-xl border text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500 ${
                          isSelected
                            ? "border-emerald-500 bg-[#15222E]"
                            : "border-[#1E293B] bg-[#0D141C] hover:border-slate-600"
                        }`}
                      >
                        <div className="relative aspect-video w-full overflow-hidden bg-[#0B1117]">
                          {!imgFailed ? (
                            <img
                              src={option.imageUrl}
                              alt={option.title}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setFailedImages((prev) => ({
                                  ...prev,
                                  [option.id]: true,
                                }))
                              }
                              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#13202E] to-[#0B1117] text-xs font-medium text-slate-400">
                              {option.title}
                            </div>
                          )}
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0D141C]/90 via-black/25 to-transparent" />
                          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2">
                            <span className="font-display text-sm font-semibold text-white truncate">
                              {option.title}
                            </span>
                            {isSelected && (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-600 text-white shrink-0">
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-1 flex-col justify-between p-3.5">
                          <p className="text-xs leading-relaxed text-slate-300">
                            {option.subtitle}
                          </p>
                          <p className="mt-3 font-mono text-[11px] text-slate-400">
                            {option.recommendedEngine} · {option.recommendedVersion}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: direction * 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -18 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                <h2 className="font-display text-lg font-semibold text-slate-100">
                  02. Selección de jugadores y recursos
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Ajusta la capacidad simultánea para dimensionar la memoria RAM sin cuellos de botella.
                </p>

                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-7 space-y-5">
                    <div className="rounded-lg border border-[#1E293B] bg-[#0D141C] p-5">
                      <div className="flex items-baseline justify-between gap-4">
                        <label
                          htmlFor="player-capacity-slider"
                          className="text-sm font-medium text-slate-200"
                        >
                          Capacidad estimada de jugadores
                        </label>
                        <span className="font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
                          {playerCount >= 100 ? "100+" : playerCount}{" "}
                          <span className="text-xs font-normal text-slate-400">
                            jugadores
                          </span>
                        </span>
                      </div>

                      <input
                        id="player-capacity-slider"
                        type="range"
                        min={10}
                        max={110}
                        step={5}
                        value={playerCount}
                        onChange={(e) => setPlayerCount(Number(e.target.value))}
                        className="mt-5 h-2 w-full cursor-pointer accent-emerald-500"
                      />

                      <div className="mt-2 flex justify-between font-mono text-[11px] text-slate-500 tabular-nums">
                        <span>10</span>
                        <span>35</span>
                        <span>60</span>
                        <span>85</span>
                        <span>100+</span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {[10, 20, 35, 50, 75, 100].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setPlayerCount(val)}
                            className={`rounded-md border px-3 py-1 font-mono text-xs tabular-nums transition-colors cursor-pointer ${
                              playerCount === val
                                ? "border-emerald-500 bg-emerald-600/20 text-emerald-300"
                                : "border-[#1E293B] bg-[#111923] text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            {val === 100 ? "100+" : val}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="wizard-engine"
                          className="block text-xs font-medium text-slate-400"
                        >
                          Mod Loader / Motor
                        </label>
                        <select
                          id="wizard-engine"
                          value={preferredEngine}
                          onChange={(e) => setPreferredEngine(e.target.value)}
                          className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#0B1117] px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="Forge">Forge</option>
                          <option value="Fabric">Fabric</option>
                          <option value="NeoForge">NeoForge</option>
                          <option value="Paper">Paper (Plugins)</option>
                          <option value="auto">Automático</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="wizard-version"
                          className="block text-xs font-medium text-slate-400"
                        >
                          Versión de Minecraft
                        </label>
                        <select
                          id="wizard-version"
                          value={preferredVersion}
                          onChange={(e) => setPreferredVersion(e.target.value)}
                          className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#0B1117] px-3 py-2 font-mono text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="1.20.1">1.20.1 (Recomendada Modrinth)</option>
                          <option value="1.21.1">1.21.1</option>
                          <option value="1.19.2">1.19.2</option>
                          <option value="1.18.2">1.18.2</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Live RAM Calculation Preview */}
                  <div className="lg:col-span-5 rounded-lg border border-[#1E293B] bg-[#0D141C] p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-400">
                          Cálculo en vivo de RAM
                        </span>
                        <SlidersHorizontal
                          className="h-4 w-4 text-slate-500"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-2 font-mono text-3xl font-semibold text-emerald-400 tabular-nums">
                        {ramEstimate.total} GB
                      </p>

                      <dl className="mt-5 divide-y divide-[#1E293B]/70 text-xs">
                        <div className="flex items-center justify-between py-2">
                          <dt className="text-slate-400">Base inicial</dt>
                          <dd className="font-mono text-slate-200 tabular-nums">
                            {ramEstimate.base} GB
                          </dd>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <dt className="text-slate-400">
                            Escala ({playerCount >= 100 ? "100+" : playerCount} jug.)
                          </dt>
                          <dd className="font-mono text-slate-200 tabular-nums">
                            +{ramEstimate.playersGb} GB
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 py-2">
                          <dt className="text-slate-400">
                            {ramEstimate.complexityReason}
                          </dt>
                          <dd className="font-mono text-slate-200 tabular-nums shrink-0">
                            +{ramEstimate.complexityGb} GB
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <p className="mt-4 text-xs text-slate-500">
                      Plan sugerido:{" "}
                      <span className="font-medium text-slate-200">
                        {PRICING_PLANS.find((p) => p.id === recommendedPlanId)?.name}
                      </span>
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: direction * 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -18 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-slate-100">
                      03. Requerimientos clave
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      Activa los sistemas y mecánicas que incluirá tu servidor. La IA seleccionará los mods compatibles y scripts KubeJS necesarios.
                    </p>
                  </div>
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    {selectedFeatures.length} seleccionados
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {FEATURE_OPTIONS.map((feature) => {
                    const checked = selectedFeatures.includes(feature.id);
                    return (
                      <button
                        key={feature.id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggleFeature(feature.id)}
                        className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500 ${
                          checked
                            ? "border-emerald-500/80 bg-[#15222E]"
                            : "border-[#1E293B] bg-[#0D141C] hover:border-slate-600"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            checked
                              ? "border-emerald-500 bg-emerald-600 text-white"
                              : "border-slate-600 bg-[#0B1117]"
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-slate-100">
                            {feature.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">
                            {feature.detail}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="wizard-extra-notes"
                    className="block text-xs font-medium text-slate-400"
                  >
                    Requerimientos adicionales personalizados (opcional)
                  </label>
                  <input
                    id="wizard-extra-notes"
                    type="text"
                    value={extraNotes}
                    onChange={(e) => setExtraNotes(e.target.value)}
                    placeholder="Ej.: Sistema de facciones con impuestos semanales o jefes custom cada domingo..."
                    className="mt-1.5 w-full rounded-md border border-[#1E293B] bg-[#0B1117] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, x: direction * 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -18 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-slate-100">
                      04. Resumen de plan y suscripción mensual
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      Revisa la configuración seleccionada y confirma el nivel de infraestructura antes de generar el manifiesto técnico.
                    </p>
                  </div>
                  <p className="font-mono text-xs text-slate-400 tabular-nums">
                    {serverName || selectedModality.defaultServerName} ·{" "}
                    {preferredEngine} {preferredVersion} · {ramEstimate.total} GB RAM
                  </p>
                </div>

                {/* Summary strip */}
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-[#1E293B] bg-[#0D141C] p-4 sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] text-slate-400">Modalidad</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-100 truncate">
                      {selectedModality.title}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Capacidad</p>
                    <p className="mt-0.5 font-mono text-xs font-semibold text-slate-100 tabular-nums">
                      {playerCount >= 100 ? "100+" : playerCount} jugadores
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">RAM calculada</p>
                    <p className="mt-0.5 font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                      {ramEstimate.total} GB DDR5
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Módulos elegidos</p>
                    <p className="mt-0.5 font-mono text-xs font-semibold text-slate-100 tabular-nums">
                      {selectedFeatures.length} requerimientos
                    </p>
                  </div>
                </div>

                {/* Pricing Tier Cards */}
                <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {PRICING_PLANS.map((plan) => {
                    const isSelected = activePlan.id === plan.id;
                    const isRecommended = recommendedPlanId === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanOverride(plan.id)}
                        aria-pressed={isSelected}
                        className={`flex flex-col justify-between rounded-xl border p-5 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-500 ${
                          isSelected
                            ? "border-emerald-500 bg-[#15222E]"
                            : "border-[#1E293B] bg-[#0D141C] hover:border-slate-600"
                        }`}
                      >
                        <div>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-display text-base font-semibold text-slate-100">
                              {plan.name}
                            </span>
                            {isRecommended && (
                              <span className="text-[11px] font-medium text-emerald-400">
                                Recomendado
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {plan.audience}
                          </p>
                          <p className="mt-4 font-mono text-2xl font-bold text-slate-100 tabular-nums">
                            ${plan.priceMonthly}
                            <span className="text-xs font-normal text-slate-400">
                              /mes
                            </span>
                          </p>
                        </div>

                        <dl className="mt-5 space-y-2 border-t border-[#1E293B] pt-4 text-xs">
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-400">Capacidad</dt>
                            <dd className="font-mono text-slate-200 tabular-nums">
                              {plan.playerLimit}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-400">Memoria</dt>
                            <dd className="font-mono text-slate-200 tabular-nums">
                              {plan.ramRange}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-400">Entorno</dt>
                            <dd className="text-right text-slate-200">
                              {plan.engineSupport}
                            </dd>
                          </div>
                          <div className="pt-1 text-[11px] text-slate-400">
                            {plan.extras}
                          </div>
                        </dl>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer Navigation Controls */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#1E293B] pt-4">
            <div>
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => goToStep((step - 1) as 1 | 2 | 3 | 4)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0D141C] px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 whitespace-nowrap cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Anterior</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => goToStep((step + 1) as 1 | 2 | 3 | 4)}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
                >
                  <span>Siguiente paso</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDeployClick}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Ver Progreso de Despliegue</span>
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4" aria-hidden="true" />
                      <span>Desplegar Servidor con IA</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {retryStatus && (
          <div
            role="status"
            className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-200"
          >
            {retryStatus}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
