// Cópia de sunoboard/apps/mcp-server/src/models.ts (MCP hospedado) — mantenha os dois iguais.
// Modelos no MCP hospedado: schema do generate_music/generate_sfx com o parâmetro `model`,
// aviso "qual modelo foi usado e como trocar" e a tool list_models.
// Fonte da verdade: GET /api/v1/models (catálogo da API). FALLBACK_* só se a API não responder.

export const SETTINGS_MODELS_URL = 'https://sunoboard.com/settings#models';

export interface McpModel {
  id: string;
  label: string;
  kind: 'music' | 'sfx';
  quotaCost: number;
  quotaPool?: 'music' | 'sfx';
  costPerSeconds?: number;
  defaultDurationSec?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  bestFor?: string;
  shortDescription?: string;
  instrumentalOnly?: boolean;
  supportsCustomMode?: boolean;
  default?: boolean;
  provider?: string;
  /** O que um pedido entrega ("2 songs") e a frase pronta ("1 credit → 2 songs") — vêm da API. */
  result?: string;
  costText?: string;
  /** false = fornecedor esgotado/fora do ar agora (ex.: cota mensal do ElevenLabs Music). */
  available?: boolean;
  unavailableReason?: string | null;
}

export interface McpCatalog {
  music: McpModel[];
  sfx: McpModel[];
  userDefaults?: { music?: { id: string }; sfx?: { id: string } };
}

/** Valores antigos do campo `model` (sunoapi.org) — continuam aceitos. */
export const LEGACY_SUNO: Record<string, string> = {
  V4: 'suno-v4',
  V4_5: 'suno-v4_5',
  V4_5PLUS: 'suno-v4_5plus',
  V4_5ALL: 'suno-v4_5all',
  V5: 'suno-v5',
  V5_5: 'suno-v5_5',
};

const suno = (id: string, label: string): McpModel => ({ id, label, kind: 'music', quotaCost: 1, provider: 'suno', supportsCustomMode: true });

export const FALLBACK_CATALOG: McpCatalog = {
  music: [
    { ...suno('suno-v4_5', 'Suno V4.5'), default: true },
    suno('suno-v4', 'Suno V4'),
    suno('suno-v4_5plus', 'Suno V4.5+'),
    suno('suno-v4_5all', 'Suno V4.5 All'),
    suno('suno-v5', 'Suno V5'),
    suno('suno-v5_5', 'Suno V5.5'),
    { id: 'lyria-3-pro', label: 'Google Lyria 3 Pro', kind: 'music', quotaCost: 2, provider: 'replicate' },
    { id: 'minimax-2.6', label: 'MiniMax Music 2.6', kind: 'music', quotaCost: 4, provider: 'replicate', supportsCustomMode: true },
    { id: 'stable-audio-2.5', label: 'Stable Audio 2.5', kind: 'music', quotaCost: 5, provider: 'replicate', instrumentalOnly: true, defaultDurationSec: 90, maxDurationSec: 190 },
  ],
  sfx: [
    { id: 'elevenlabs-sfx', label: 'ElevenLabs SFX', kind: 'sfx', quotaCost: 1, quotaPool: 'sfx', default: true },
    { id: 'tangoflux', label: 'TangoFlux', kind: 'sfx', quotaCost: 1, quotaPool: 'sfx' },
    { id: 'stable-audio-ambience', label: 'Stable Audio — long ambience & loops', kind: 'sfx', quotaCost: 5, quotaPool: 'music', maxDurationSec: 60 },
  ],
};

/** Dica curta por modelo (schema, aviso e list_models). */
export const MODEL_HINTS: Record<string, string> = {
  'suno-v4_5': 'songs with lyrics & vocals, best value',
  'suno-v4': 'classic & fast',
  'suno-v4_5plus': 'richer sound',
  'suno-v4_5all': 'full control',
  'suno-v5': 'expressive vocals',
  'suno-v5_5': 'newest Suno',
  'lyria-3-pro': 'beautiful fast instrumentals',
  'minimax-2.6': 'sings your exact lyrics in any language, slow (1–3.5 min)',
  'stable-audio-2.5': 'long instrumentals & loops up to 3 min, instrumental only',
  'elevenlabs-music': 'fastest (~10 s), writes its own lyrics, pick the length',
  'elevenlabs-sfx': 'best overall',
  tangoflux: 'cheaper, a bit muffled',
  'stable-audio-ambience': 'rain, wind, room tone, seamless game loops',
};

/**
 * O que UM pedido entrega — para a frase "custo → resultado" (1 crédito ≠ 1 música).
 * short = listas compactas (aviso, schema); long = o modelo usado e o list_models.
 */
const RESULTS: Record<string, { short: string; long: string }> = {
  suno: { short: '2 songs', long: '2 songs' },
  'lyria-3-pro': { short: '1 track', long: '1 track (up to ~3 min)' },
  'minimax-2.6': { short: '1 song, exact lyrics', long: '1 song with your exact lyrics' },
  'stable-audio-2.5': { short: '1 long instrumental', long: '1 long instrumental (up to 3 min)' },
  'stable-audio-ambience': { short: '1 ambience/loop up to 60 s', long: "1 ambience/loop up to 60 s (doesn't use your sound-effect allowance)" },
};

export function isSunoId(id: string): boolean {
  return id.startsWith('suno-');
}

/** suno-v4_5 → V4_5 (valor que o handler do pacote npm envia à API). */
export function sunoLegacyValue(id: string): string | undefined {
  return Object.entries(LEGACY_SUNO).find(([, v]) => v === id)?.[0];
}

/** Aceita id do catálogo ou legado (V4_5). Devolve o id do catálogo ou undefined. */
export function normalizeMusicModel(input: unknown): string | undefined {
  if (typeof input !== 'string' || !input.trim()) return undefined;
  const raw = input.trim();
  return LEGACY_SUNO[raw.toUpperCase()] ?? raw.toLowerCase();
}

/** Duração efetiva (s) de um modelo com custo por duração. */
function lengthFor(m: McpModel, durationSec?: number): number {
  return Math.min(m.maxDurationSec ?? 180, Math.max(m.minDurationSec ?? 10, Math.round(durationSec || m.defaultDurationSec || 60)));
}

/** Custo na cota (ElevenLabs Music: por duração). */
export function costFor(m: McpModel | undefined, durationSec?: number): number {
  if (!m) return 1;
  if (!m.costPerSeconds) return m.quotaCost;
  return Math.max(1, Math.ceil(lengthFor(m, durationSec) / m.costPerSeconds));
}

export const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
/** "1 credit" / "85 credits" — a unidade da cota de música (1 Suno = 1 crédito = 2 músicas). */
export const credits = (n: number) => plural(n, 'credit');

/** Sai da cota de efeitos (conta como "sound effect"), não dos créditos. */
const usesSfxAllowance = (m: McpModel | undefined) => !!m && m.kind === 'sfx' && m.quotaPool !== 'music';

/** O que o pedido entrega: "2 songs", "1 track of 90 s", "1 long instrumental (up to 3 min)". */
export function resultFor(m: McpModel, opts: { durationSec?: number; short?: boolean } = {}): string {
  if (m.costPerSeconds) {
    const secs = lengthFor(m, opts.durationSec);
    return opts.short ? `${secs} s` : `1 track of ${secs} s`;
  }
  const known = isSunoId(m.id) ? RESULTS.suno : RESULTS[m.id];
  if (known) return opts.short ? known.short : known.long;
  return m.result ?? (m.kind === 'sfx' ? '1 sound effect' : '1 track');
}

/**
 * Custo → resultado, como o usuário vê: "1 credit → 2 songs", "4 credits → 60 s" (short),
 * "1 sound effect" (efeitos têm cota própria). `cost` sobrescreve o custo calculado (vem da API).
 */
export function costResult(m: McpModel | undefined, opts: { durationSec?: number; short?: boolean; cost?: number } = {}): string {
  if (!m) return '1 credit → 2 songs';
  const cost = opts.cost ?? costFor(m, opts.durationSec);
  if (usesSfxAllowance(m)) return plural(cost, 'sound effect');
  return `${credits(cost)} → ${resultFor(m, opts)}`;
}

/** Schemas do pacote npm + `model` (e duration_seconds) com a lista de modelos e custos. */
export function extendToolSchemas<T extends { name: string; description?: string; inputSchema: any }>(schemas: T[], catalog: McpCatalog): T[] {
  return schemas.map((tool) => {
    if (tool.name === 'generate_music') {
      const ids = catalog.music.map((m) => m.id);
      const list = catalog.music
        .filter((m) => !isSunoId(m.id) || m.id === 'suno-v4_5' || m.id === 'suno-v5_5')
        .map((m) => {
          const cost = m.costPerSeconds
            ? `${costResult(m, { short: true })} by default, 1 credit per ${m.costPerSeconds} s`
            : costResult(m, { short: true });
          return `${m.id} = ${m.label} (${cost}; ${MODEL_HINTS[m.id] ?? m.bestFor ?? ''}${m.available === false ? '; UNAVAILABLE right now' : ''})`;
        })
        .join(' · ');
      const hasLength = catalog.music.filter((m) => m.defaultDurationSec).map((m) => m.id);
      return {
        ...tool,
        description:
          `${tool.description} Several AI models are available (see list_models); the default is the user's profile default (normally Suno V4.5). Each model costs a different number of the user's monthly credits — tell the user what it costs and what they get (Suno: 1 credit → 2 songs).`,
        inputSchema: {
          ...tool.inputSchema,
          properties: {
            ...tool.inputSchema.properties,
            model: {
              type: 'string',
              enum: [...ids, ...Object.keys(LEGACY_SUNO)],
              description:
                `Music model. Omit to use the user's default model from their SunoBoard profile. Options (credits → what you get): ${list}. Other Suno versions: suno-v4, suno-v4_5plus, suno-v4_5all, suno-v5 (1 credit → 2 songs each). Legacy values V4…V5_5 still work. Lyrics (customMode) are sung exactly only by Suno and minimax-2.6.`,
            },
            ...(hasLength.length
              ? {
                  duration_seconds: {
                    type: 'number',
                    minimum: 10,
                    maximum: 190,
                    description: `Track length in seconds, only for ${hasLength.join(', ')} (elevenlabs-music: 10–180 s, default 60, costs 1 credit per 16 s — 60 s = 4 credits; stable-audio-2.5: up to 190 s, default 90, always 5 credits). Ignored by other models.`,
                  },
                }
              : {}),
          },
        },
      };
    }
    if (tool.name === 'generate_sfx') {
      const list = catalog.sfx.map((m) => `${m.id} = ${m.label} (${costResult(m, { short: true })}; ${MODEL_HINTS[m.id] ?? m.bestFor ?? ''})`).join(' · ');
      return {
        ...tool,
        inputSchema: {
          ...tool.inputSchema,
          properties: {
            ...tool.inputSchema.properties,
            durationSeconds: {
              type: 'number',
              description: 'Length in seconds, 0.5–10 (default 3). stable-audio-ambience: up to 60 (default 30).',
            },
            model: {
              type: 'string',
              enum: catalog.sfx.map((m) => m.id),
              description: `Sound-effect model. Omit to use the user's default (normally ElevenLabs SFX). Sound effects use the user's monthly sound-effect allowance (1 per effect), not credits — except stable-audio-ambience, which spends music credits. Options: ${list}.`,
            },
          },
        },
      };
    }
    return tool;
  });
}

/**
 * Linha "qual modelo foi usado, quanto custou e como trocar", anexada a todo generate_music / generate_sfx.
 * Ex.: 🎛️ Model: Suno V4.5 — your default · 1 credit → 2 songs. 85 credits left. Change your default at … or ask me for: …
 */
export function modelNotice(opts: {
  kind: 'music' | 'sfx';
  catalog: McpCatalog;
  modelId: string;
  isDefault: boolean;
  cost: number;
  defaultLabel?: string;
  /** Duração pedida (modelos com custo por duração: "1 track of 90 s"). */
  durationSec?: number;
  /** Saldo depois deste pedido, na unidade do modelo (créditos ou efeitos). Omitido = não mostra. */
  remaining?: number;
}): string {
  const { kind, catalog, modelId, isDefault, cost } = opts;
  const list = kind === 'music' ? catalog.music : catalog.sfx;
  const m = list.find((x) => x.id === modelId);
  const label = m?.label ?? modelId;
  const spent = m ? costResult(m, { cost, durationSec: opts.durationSec }) : kind === 'music' ? credits(cost) : plural(cost, 'sound effect');
  const which = isDefault ? 'your default' : `picked for this request${opts.defaultLabel ? `; your default is ${opts.defaultLabel}` : ''}`;
  const sfxUnit = kind === 'sfx' && (!m || usesSfxAllowance(m));
  const left = typeof opts.remaining === 'number'
    ? ` ${sfxUnit ? plural(Math.max(0, opts.remaining), 'sound effect') : credits(Math.max(0, opts.remaining))} left.`
    : '';
  const sfxHints: Record<string, string> = { 'elevenlabs-sfx': 'best overall', tangoflux: 'cheaper' };
  const others = list
    .filter((x) => x.id !== modelId && x.available !== false && (!isSunoId(x.id) || (x.id === 'suno-v4_5' && !isSunoId(modelId))))
    .map((x) => `${x.id} (${[costResult(x, { short: true }), kind === 'sfx' ? sfxHints[x.id] : ''].filter(Boolean).join(', ')})`)
    .join(', ');
  return `🎛️ Model: ${label} — ${which} · ${spent}.${left} Change your default at ${SETTINGS_MODELS_URL}${others ? ` or ask me for: ${others}` : ''}.`;
}

/** Saída da tool list_models. */
export function formatModelList(catalog: McpCatalog) {
  const defMusic = catalog.userDefaults?.music?.id ?? catalog.music.find((m) => m.default)?.id;
  const defSfx = catalog.userDefaults?.sfx?.id ?? catalog.sfx.find((m) => m.default)?.id;
  const row = (m: McpModel, def?: string) => ({
    id: m.id,
    label: m.label,
    bestFor: m.bestFor ?? MODEL_HINTS[m.id] ?? m.shortDescription,
    cost: m.costPerSeconds
      ? `${costResult(m)} (1 credit per ${m.costPerSeconds} s, length ${m.minDurationSec ?? 10}–${m.maxDurationSec ?? 180} s)`
      : costResult(m),
    recommended: !!m.default,
    available: m.available !== false,
    ...(m.available === false ? { unavailableReason: m.unavailableReason ?? 'Temporarily unavailable' } : {}),
    yourDefault: m.id === def,
  });
  return {
    yourDefaults: { music: defMusic, sfx: defSfx },
    music: catalog.music.map((m) => row(m, defMusic)),
    soundEffects: catalog.sfx.map((m) => row(m, defSfx)),
    howCostsWork:
      'Music models spend monthly credits — always shown as "credits → what you get" (Suno: 1 credit → 2 songs). Sound effects have their own monthly allowance (1 per effect); stable-audio-ambience spends music credits instead.',
    howToChange: `Pass "model" to generate_music / generate_sfx for one request, or change your default at ${SETTINGS_MODELS_URL}.`,
  };
}
