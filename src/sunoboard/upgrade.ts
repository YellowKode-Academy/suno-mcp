// Cópia de sunoboard/apps/mcp-server/src/upgrade.ts (MCP hospedado) — mantenha os dois iguais.
// Oferta de upgrade dentro da conversa (Claude/Cursor): transforma o 402 QUOTA_EXCEEDED da API
// em texto amigável e monta o aviso de "quase no limite" após cada geração. Funções puras.

export interface UpgradeOffer {
  id: string;
  title: string;
  pitch?: string;
  includes?: string;
  priceLabel?: string;
  price?: { usd?: { label?: string }; brl?: { label?: string } };
  recommended?: boolean;
}

export interface QuotaExceededPayload {
  error: 'QUOTA_EXCEEDED';
  kind: 'music' | 'sfx';
  plan: string;
  used: number;
  limit: number;
  resetsAt?: string;
  message?: string;
  upgradeUrl?: string;
  offers?: UpgradeOffer[];
  remaining?: number;
  /** O modelo pedido custa mais do que sobra (ex.: MiniMax 4, sobram 2). */
  requested?: { label: string; cost: number; left: number };
}

export interface UsagePayload {
  plan?: string;
  used?: number;
  limit?: number;
  bonus?: number;
  remaining?: number;
  resetsAt?: string;
  unlimited?: boolean;
  offers?: UpgradeOffer[];
  /** BYOK: Suno é ilimitado; os outros modelos gastam os créditos do plano (este bloco). */
  otherModels?: UsagePayload;
}

const PLAN_TITLES: Record<string, string> = { free: 'Free', basic: 'Basic', pro: 'Pro', studio: 'Studio' };
const planTitle = (plan?: string) => PLAN_TITLES[plan ?? ''] ?? plan ?? 'current';
const n = (v: number) => v.toLocaleString('en-US');
/** "1 credit" / "85 credits" — a unidade da cota de música que o usuário vê. */
const credits = (v: number) => `${n(v)} credit${v === 1 ? '' : 's'}`;
/** Equivalência Suno (1 crédito = 1 pedido = 2 músicas) — dá noção do que o saldo rende. */
const songs = (v: number) => `up to ${n(v * 2)} song${v * 2 === 1 ? '' : 's'} with Suno`;

export function upgradeLink(webUrl: string, kind: 'music' | 'sfx' = 'music'): string {
  return `${webUrl.replace(/\/$/, '')}/upgrade?kind=${kind}&src=mcp`;
}

export function formatResetDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function isQuotaPayload(v: unknown): v is QuotaExceededPayload {
  return !!v && typeof v === 'object' && (v as { error?: unknown }).error === 'QUOTA_EXCEEDED';
}

/**
 * Acha o JSON do 402 dentro do erro. O suno-mcp-core lança `API error 402: {json}` e o sbApi
 * `SunoBoard API 402: {json}`; também aceita o objeto direto ou um JSON puro.
 */
export function parseQuotaExceeded(input: unknown): QuotaExceededPayload | null {
  if (isQuotaPayload(input)) return input;
  const text = input instanceof Error ? input.message : typeof input === 'string' ? input : '';
  if (!text.includes('QUOTA_EXCEEDED')) return null;
  const start = text.indexOf('{');
  if (start < 0) return null;
  const candidates = [text.slice(start), text.slice(start, text.lastIndexOf('}') + 1)];
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (isQuotaPayload(parsed)) return parsed;
    } catch {
      /* tenta o próximo recorte */
    }
  }
  return null;
}

function priceText(o: UpgradeOffer): string {
  if (o.priceLabel) return o.priceLabel;
  const usd = o.price?.usd?.label;
  return usd ? `US${usd}` : '';
}

/** Texto que o Claude repassa ao usuário quando a cota acabou (no lugar do erro cru). */
export function formatQuotaExceeded(p: QuotaExceededPayload, webUrl: string): string {
  const sfx = p.kind === 'sfx';
  const when = formatResetDate(p.resetsAt);
  const link = upgradeLink(webUrl, p.kind);
  const offers = (p.offers ?? []).slice(0, 2);

  const r = p.requested;
  const lines = r && r.left > 0
    ? [
        `${r.label} needs ${credits(r.cost)} and you have ${n(r.left)} left on the ${planTitle(p.plan)} plan. Nothing was generated or charged.`,
        `A lighter model still fits: Suno costs 1 credit → 2 songs — call generate_music with model "suno-v4_5", or list_models to compare.`,
      ]
    : [
        `You've used all ${sfx ? `${n(p.limit)} sound effects` : credits(p.limit)} on the ${planTitle(p.plan)} plan this month. Nothing was generated or charged.`,
      ];
  if (offers.length) {
    lines.push('', 'Keep creating right now:');
    for (const o of offers) {
      const price = priceText(o);
      lines.push(`• ${o.title}${price ? ` (${price})` : ''}${o.includes ? `: ${o.includes}` : ''}${o.recommended ? ' — recommended' : ''}`);
    }
  }
  lines.push('', `Upgrade in one click: ${link}`);
  if (when) lines.push(`Or wait — your ${sfx ? 'sound effects' : 'credits'} reset on ${when}.`);
  lines.push(
    '',
    "(Assistant: share these options and the link with the user in your own words — say what each costs and what they get. Don't retry this tool until they upgrade or the credits reset.)",
  );
  return lines.join('\n');
}

/**
 * Aviso anexado ao generate_music bem-sucedido. Silencioso se BYOK ou se ainda sobra bastante;
 * com ≤ 2 restantes inclui o link de upgrade (momento de maior intenção: acabou de gerar).
 */
export function formatQuotaNotice(u: UsagePayload | null | undefined, webUrl: string): string | undefined {
  if (!u || u.unlimited || typeof u.limit !== 'number') return undefined;
  const planLeft = Math.max(0, u.limit - (u.used ?? 0));
  const bonus = u.bonus ?? 0;
  const remaining = typeof u.remaining === 'number' ? u.remaining : planLeft + bonus;
  const when = formatResetDate(u.resetsAt);
  const link = upgradeLink(webUrl, 'music');

  if (remaining > 2) {
    return planLeft === 0 && bonus > 0
      ? `Your plan's monthly credits are used up — this came from your bonus credits (${n(bonus)} left).`
      : undefined;
  }
  if (remaining <= 0) {
    const offers = (u.offers ?? []).slice(0, 2).map((o) => `${o.title}${o.price?.usd?.label ? ` US${o.price.usd.label}` : ''}`);
    return (
      `You've used all ${credits(u.limit)} on the ${planTitle(u.plan)} plan this month${when ? ` (resets ${when})` : ''}.` +
      ` Keep going${offers.length ? ` with ${offers.join(' or ')}` : ''}: ${link}`
    );
  }
  return `Heads up: ${credits(remaining)} left this month (${songs(remaining)})${when ? `, resets ${when}` : ''}. Get more: ${link}`;
}

/**
 * Resumo de uma linha para o get_usage: "86 credits left this month (up to 172 songs with Suno) · resets Nov 1."
 * BYOK: Suno ilimitado, os outros modelos gastam os créditos do plano.
 */
export function formatUsageSummary(u: UsagePayload | null | undefined): string | undefined {
  if (!u) return undefined;
  const left = (p: UsagePayload, withSongs: boolean) => {
    const remaining = typeof p.remaining === 'number' ? p.remaining : Math.max(0, (p.limit ?? 0) - (p.used ?? 0)) + (p.bonus ?? 0);
    const when = formatResetDate(p.resetsAt);
    const extra = [withSongs ? songs(remaining) : '', p.bonus ? `includes ${n(p.bonus)} bonus credits that never expire` : '']
      .filter(Boolean)
      .join('; ');
    return `${credits(remaining)} left this month${extra ? ` (${extra})` : ''}${when ? ` · resets ${when}` : ''}`;
  };
  if (u.unlimited) {
    const other = u.otherModels;
    return `Suno songs are unlimited with your own Suno key.${other && typeof other.limit === 'number' ? ` Other models use your plan credits: ${left(other, false)}.` : ''}`;
  }
  if (typeof u.limit !== 'number') return undefined;
  return `${left(u, true)}. Each model costs a different number of credits (Suno: 1 credit → 2 songs) — call list_models to compare.`;
}
