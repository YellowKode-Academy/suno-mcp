// Ferramentas extras quando a chave é da SunoBoard (sb_...): efeitos sonoros, vários modelos de música,
// uso do mês, biblioteca pública e link de indicação — as mesmas do MCP hospedado (mcp.sunoboard.com,
// sunoboard/apps/mcp-server/src/index.ts). Com chave da sunoapi.org (BYOK direto) nada disso existe.
import { toolSchemas, type createHandlers, type GenerateMusicParams } from '@yellowkode/suno-mcp-core';
import {
  FALLBACK_CATALOG,
  type McpCatalog,
  costFor,
  extendToolSchemas,
  formatModelList,
  isSunoId,
  modelNotice,
  normalizeMusicModel,
  sunoLegacyValue,
} from './models.js';
import { formatQuotaExceeded, formatQuotaNotice, formatUsageSummary, parseQuotaExceeded, type UsagePayload } from './upgrade.js';

type Handlers = ReturnType<typeof createHandlers>;
type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

export const extraToolSchemas = [
  {
    name: 'generate_sfx',
    description:
      'Generate a sound effect from a text description (SunoBoard SFX) — game sounds (coin, jump, laser, sword clash, door creak, footsteps, explosion, monster roar), UI sounds and video transitions (whoosh, riser, impact). Returns the audio URL immediately (about 2 seconds). Each effect uses 1 of the user\'s monthly sound effects (not credits).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What the sound is, e.g. "heavy wooden door creaking open slowly"' },
        durationSeconds: { type: 'number', description: 'Length in seconds, 0.5–10 (default 3)' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'search_library',
    description:
      'Search the public SunoBoard Discover library of ready-made tracks (free, instant, no credits used). Try this first when the user needs a common style (e.g. "horror chase", "lo-fi study", "documentary background"). Each result has an audioUrl, a pageUrl and the original prompt/style, which can be passed to generate_music to create a fresh variation.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords: genre, mood, use case (e.g. "epic boss battle orchestral")' },
        instrumental: { type: 'boolean', description: 'Only instrumentals (true) or only vocal tracks (false)' },
        limit: { type: 'number', description: 'Max results (default 8, max 20)' },
      },
    },
  },
  {
    name: 'get_usage',
    description:
      'Show how many SunoBoard credits are left this month (plan credits + bonus credits), when they reset and the user\'s default music / sound-effect models. Credits pay for music: Suno costs 1 credit → 2 songs; other models cost more (see list_models).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_models',
    description:
      'List the AI models available for generate_music and generate_sfx (Suno, Google Lyria, MiniMax, Stable Audio, ElevenLabs…) with what each is best for, what each costs and what you get (e.g. Suno: 1 credit → 2 songs; Stable Audio: 5 credits → 1 long instrumental), and the user\'s current defaults. Use it when the user asks which model to use or wants something Suno is not good at (exact lyrics in another language, long instrumentals, ambience loops).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_referral_link',
    description:
      "Get the user's SunoBoard referral link. Both the user and the friend get 10 bonus credits when the friend creates their first song; the user gets 100 more if the friend subscribes. Bonus credits never expire.",
    inputSchema: { type: 'object', properties: {} },
  },
];

// Anotações MCP: título legível + se a tool só lê dados.
const TOOL_META: Record<string, { title: string; readOnly: boolean }> = {
  generate_music: { title: 'Generate music', readOnly: false },
  get_music_status: { title: 'Get music status', readOnly: true },
  wait_for_music: { title: 'Wait for music', readOnly: true },
  list_recent_music: { title: 'List recent music', readOnly: true },
  get_credits: { title: 'Get credits', readOnly: true },
  search_library: { title: 'Search music library', readOnly: true },
  get_usage: { title: 'Get usage', readOnly: true },
  get_referral_link: { title: 'Get referral link', readOnly: true },
  list_models: { title: 'List models', readOnly: true },
  generate_sfx: { title: 'Generate sound effect', readOnly: false },
};

export function withAnnotations<T extends { name: string }>(tool: T) {
  const meta = TOOL_META[tool.name];
  if (!meta) return tool;
  return {
    ...tool,
    title: meta.title,
    annotations: {
      title: meta.title,
      readOnlyHint: meta.readOnly,
      destructiveHint: false,
      idempotentHint: meta.readOnly,
      openWorldHint: !meta.readOnly,
    },
  };
}

export const SUNOBOARD_TOOL_NAMES = new Set(extraToolSchemas.map((t) => t.name));

export function createSunoBoardTools(opts: { apiKey: string; apiBase: string; webUrl?: string; handlers: Handlers }) {
  const { apiKey, apiBase, handlers } = opts;
  const WEB_URL = opts.webUrl ?? 'https://sunoboard.com';

  async function sbApi(path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${apiBase}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-sunoboard-client': 'mcp',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const text = await res.text();
      // 402 vai inteiro: o JSON da oferta de upgrade vira texto amigável no chat
      throw new Error(`SunoBoard API ${res.status}: ${res.status === 402 ? text : text.slice(0, 200)}`);
    }
    return res.json();
  }

  /** Uso do mês. Nunca falha: sem resposta, os avisos só não mostram o saldo. */
  async function fetchUsage(): Promise<UsagePayload | undefined> {
    try {
      return (await sbApi('/api/v1/usage')) as UsagePayload;
    } catch {
      return undefined;
    }
  }

  /** BYOK + Suno = ilimitado (undefined); BYOK + outro modelo = créditos do plano (otherModels). */
  function creditPool(u: UsagePayload | undefined, suno: boolean): UsagePayload | undefined {
    if (!u) return undefined;
    if (u.unlimited) return suno ? undefined : u.otherModels;
    return u;
  }

  /** Catálogo de modelos + padrões do usuário (uma vez; sem API, usa o estático). */
  let catalogPromise: Promise<{ catalog: McpCatalog; live: boolean }> | null = null;
  const getCatalog = () =>
    (catalogPromise ??= (async () => {
      try {
        const res = await fetch(`${apiBase}/api/v1/models`, {
          headers: { Authorization: `Bearer ${apiKey}`, 'x-sunoboard-client': 'mcp' },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) throw new Error(String(res.status));
        const c = (await res.json()) as McpCatalog;
        if (!Array.isArray(c?.music) || !c.music.length) throw new Error('empty catalog');
        return { catalog: c, live: true };
      } catch {
        return { catalog: FALLBACK_CATALOG, live: false };
      }
    })());

  async function listTools() {
    return extendToolSchemas([...toolSchemas, ...extraToolSchemas] as any[], (await getCatalog()).catalog).map(withAnnotations);
  }

  async function run(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    switch (name) {
      case 'generate_music': {
        const { catalog, live } = await getCatalog();
        const requested = normalizeMusicModel(args.model);
        const defaultId = catalog.userDefaults?.music?.id;
        const modelId = requested ?? defaultId ?? (live ? 'suno-v4_5' : undefined);
        const duration = typeof args.duration_seconds === 'number' ? args.duration_seconds : undefined;
        let gen: Record<string, unknown>;
        let cost = 1;
        if (!modelId || isSunoId(modelId)) {
          gen = (await handlers.generateMusic({
            ...(args as unknown as GenerateMusicParams),
            model: (modelId ? sunoLegacyValue(modelId) : 'default') as GenerateMusicParams['model'],
          })) as unknown as Record<string, unknown>;
        } else {
          const res = await sbApi('/api/v1/generate', {
            prompt: String(args.prompt ?? ''),
            model: modelId,
            ...(typeof args.style === 'string' ? { style: args.style } : {}),
            ...(typeof args.title === 'string' ? { title: args.title } : {}),
            ...(typeof args.instrumental === 'boolean' ? { instrumental: args.instrumental } : {}),
            ...(typeof args.customMode === 'boolean' ? { customMode: args.customMode } : {}),
            ...(duration ? { durationSeconds: duration } : {}),
          });
          const taskId = res?.data?.taskId;
          if (!taskId) throw new Error(`Generate failed: ${JSON.stringify(res).slice(0, 200)}`);
          cost = Number(res.data.quotaCost) || costFor(catalog.music.find((m) => m.id === modelId), duration);
          gen = {
            taskId,
            status: 'PENDING',
            message: `Generation started with ${res.data.modelLabel ?? modelId}. TaskId: ${taskId}. Use wait_for_music to get the audio URL (1 track).`,
          };
        }
        const effectiveId = modelId ?? 'suno-v4_5';
        const pool = creditPool(await fetchUsage(), isSunoId(effectiveId));
        const notice = formatQuotaNotice(pool, WEB_URL);
        return {
          ...gen,
          model: modelNotice({
            kind: 'music',
            catalog,
            modelId: effectiveId,
            isDefault: !requested || requested === defaultId,
            cost,
            durationSec: duration,
            remaining: pool?.remaining,
            defaultLabel: catalog.music.find((m) => m.id === defaultId)?.label,
          }),
          ...(notice ? { notice } : {}),
        };
      }
      case 'generate_sfx': {
        const { catalog } = await getCatalog();
        const sfx = await sbApi('/api/v1/sfx', {
          prompt: String(args.prompt ?? ''),
          ...(typeof args.durationSeconds === 'number' ? { durationSeconds: args.durationSeconds } : {}),
          ...(typeof args.model === 'string' && args.model ? { model: args.model } : {}),
        });
        const modelId = sfx.model ?? 'elevenlabs-sfx';
        const musicPool = sfx.quotaPool === 'music';
        const remaining = musicPool ? creditPool(await fetchUsage(), false)?.remaining : sfx.remaining;
        return {
          ...sfx,
          tip: `Download the audioUrl. All your sound effects are also at ${WEB_URL}/sfx`,
          modelNotice: modelNotice({
            kind: 'sfx',
            catalog,
            modelId,
            isDefault: sfx.isDefault ?? !args.model,
            cost: Number(sfx.quotaCost) || 1,
            remaining: typeof remaining === 'number' ? remaining : undefined,
            defaultLabel: catalog.sfx.find((m) => m.id === catalog.userDefaults?.sfx?.id)?.label,
          }),
        };
      }
      case 'list_models':
        return formatModelList((await getCatalog()).catalog);
      case 'search_library': {
        const qs = new URLSearchParams();
        if (args.query) qs.set('q', String(args.query));
        if (typeof args.instrumental === 'boolean') qs.set('instrumental', String(args.instrumental));
        if (args.limit) qs.set('limit', String(args.limit));
        const lib = await sbApi(`/api/v1/library?${qs.toString()}`);
        return {
          total: lib.total,
          tracks: (lib.items || []).map((t: any) => ({
            title: t.title,
            style: t.style,
            instrumental: t.instrumental,
            duration: t.duration,
            audioUrl: t.audioUrl,
            pageUrl: `${WEB_URL}/track/${t.id}`,
            prompt: t.prompt,
          })),
          tip: lib.total
            ? 'Pass a track prompt/style to generate_music to create an original variation.'
            : 'Nothing found — generate_music can create it from scratch.',
        };
      }
      case 'get_usage': {
        const u = (await sbApi('/api/v1/usage')) as UsagePayload;
        const summary = formatUsageSummary(u);
        return {
          ...(summary ? { summary } : {}),
          ...u,
          models: `Each model costs a different number of credits — Suno: 1 credit → 2 songs; Lyria: 2 credits → 1 track; MiniMax: 4 credits → 1 song with exact lyrics; Stable Audio: 5 credits → 1 long instrumental. Call list_models to compare, or change the default at ${WEB_URL}/settings#models`,
        };
      }
      case 'get_referral_link': {
        const r = await sbApi('/api/v1/referral');
        return {
          ...r,
          howItWorks:
            'Share the link. When your friend creates their first song you both get 10 bonus credits (up to 20 songs with Suno); if they subscribe you get 100 more. Bonus credits never expire.',
        };
      }
      case 'wait_for_music':
        try {
          return await handlers.waitForMusic(args.taskId as string);
        } catch (err) {
          // MiniMax pode levar até ~4 min: timeout aqui não é falha
          if (!/^Timeout/.test((err as Error).message)) throw err;
          return {
            status: 'PENDING',
            taskId: args.taskId,
            message: 'Still generating (some models, like MiniMax, take up to 4 minutes). Call wait_for_music again with the same taskId.',
          };
        }
      case 'get_credits':
        return {
          ...((await handlers.getCredits()) as object),
          note: "With your own Suno key saved in SunoBoard this is that key's sunoapi.org balance; otherwise it is your SunoBoard plan credits left this month. Call get_usage for the full breakdown (bonus credits, reset date, default models).",
        };
      default:
        return undefined; // o chamador trata (ferramentas do pacote core)
    }
  }

  /** Executa a ferramenta; `null` = não é uma ferramenta daqui (o chamador usa o fluxo padrão). */
  async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult | null> {
    if (!SUNOBOARD_TOOL_NAMES.has(name) && !['generate_music', 'wait_for_music', 'get_credits'].includes(name)) return null;
    try {
      const result = await run(name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const quota = parseQuotaExceeded(err);
      if (quota) return { content: [{ type: 'text', text: formatQuotaExceeded(quota, WEB_URL) }], isError: true };
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
    }
  }

  return { listTools, callTool };
}
