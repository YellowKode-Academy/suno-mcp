import { test } from 'vitest';
import assert from 'node:assert/strict';
import { formatQuotaExceeded, formatQuotaNotice, formatRewardNotice, formatUsageSummary, parseQuotaExceeded, type QuotaExceededPayload } from '../sunoboard/upgrade.js';

const WEB = 'https://sunoboard.com';

test('402 por custo do modelo (MiniMax 4, sobram 2): explica e sugere o Suno', () => {
  const text = formatQuotaExceeded(
    { ...body, remaining: 2, requested: { label: 'MiniMax Music 2.6', cost: 4, left: 2 } },
    WEB,
  );
  assert.match(text, /^MiniMax Music 2\.6 needs 4 credits and you have 2 left on the Free plan\. Nothing was generated or charged\./);
  assert.match(text, /Suno costs 1 credit → 2 songs/);
  assert.match(text, /model "suno-v6"/);
  assert.match(text, /Upgrade in one click: https:\/\/sunoboard\.com\/upgrade\?kind=music&src=mcp/);
});

const body: QuotaExceededPayload = {
  error: 'QUOTA_EXCEEDED',
  kind: 'music',
  plan: 'free',
  used: 5,
  limit: 5,
  resetsAt: '2026-11-01T00:00:00.000Z',
  message: "You've used all 5 credits on your Free plan this month.",
  upgradeUrl: 'https://sunoboard.com/upgrade?kind=music&src=mcp',
  offers: [
    {
      id: 'pro', title: 'Pro', recommended: true,
      includes: '100 credits/month (up to 200 songs) + 300 sound effects + API key for Claude Code',
      priceLabel: 'US$9.97/month · R$49,97/mês', price: { usd: { label: '$9.97/month' } },
    },
    {
      id: 'pack', title: '40-credit pack', recommended: false,
      includes: '40 extra credits that never expire (up to 80 songs)',
      priceLabel: 'US$4.99 one-time · R$24,90', price: { usd: { label: '$4.99' } },
    },
  ],
};

test('parseQuotaExceeded: erro do suno-mcp-core (API error 402: {json})', () => {
  const err = new Error(`API error 402: ${JSON.stringify({ statusCode: 402, ...body })}`);
  const p = parseQuotaExceeded(err);
  assert.ok(p);
  assert.equal(p.kind, 'music');
  assert.equal(p.offers?.length, 2);
});

test('parseQuotaExceeded: erro do sbApi, string pura e objeto', () => {
  assert.equal(parseQuotaExceeded(new Error(`SunoBoard API 402: ${JSON.stringify({ ...body, kind: 'sfx' })}`))?.kind, 'sfx');
  assert.equal(parseQuotaExceeded(JSON.stringify(body))?.plan, 'free');
  assert.equal(parseQuotaExceeded(body)?.limit, 5);
});

test('parseQuotaExceeded: ignora outros erros e JSON truncado', () => {
  assert.equal(parseQuotaExceeded(new Error('API error 500: {"message":"boom"}')), null);
  assert.equal(parseQuotaExceeded(new Error('API error 402: {"error":"QUOTA_EXCEEDED","kin')), null);
  assert.equal(parseQuotaExceeded(new Error('Network error: fetch failed')), null);
  assert.equal(parseQuotaExceeded(undefined), null);
});

test('formatQuotaExceeded: o que aconteceu, 2 ofertas com preço (1 linha cada), link e data', () => {
  const text = formatQuotaExceeded(body, WEB);
  assert.match(text, /^You've used all 5 credits on the Free plan this month\. Nothing was generated or charged\./);
  const offerLines = text.split('\n').filter((l) => l.startsWith('• '));
  assert.equal(offerLines.length, 2);
  assert.match(offerLines[0], /^• Pro \(US\$9\.97\/month · R\$49,97\/mês\): 100 credits\/month \(up to 200 songs\) .* — recommended$/);
  assert.match(offerLines[1], /^• 40-credit pack \(US\$4\.99 one-time · R\$24,90\): 40 extra credits that never expire/);
  assert.match(text, /https:\/\/sunoboard\.com\/upgrade\?kind=music&src=mcp/);
  assert.match(text, /your credits reset on Nov 1/);
  assert.doesNotMatch(text, /\{|QUOTA_EXCEEDED/); // nada de JSON cru
  assert.doesNotMatch(text, /generations?\b/i);
});

test('formatQuotaExceeded: com checkoutUrl assinado, "Upgrade in one click" é a 1ª ação (antes das ofertas)', () => {
  const go = 'https://api.sunoboard.com/billing/go?t=abc.def';
  const text = formatQuotaExceeded(
    { ...body, checkoutUrl: go, offers: body.offers!.map((o) => ({ ...o, checkoutUrl: `${go}-${o.id}` })) },
    WEB,
  );
  const lines = text.split('\n');
  const oneClick = lines.findIndex((l) => l === `Upgrade in one click: ${go}`);
  assert.ok(oneClick > 0, 'linha do checkout em 1 clique');
  assert.ok(oneClick < lines.findIndex((l) => l.startsWith('• ')), 'vem antes das ofertas');
  assert.equal(lines.filter((l) => l.startsWith('Upgrade in one click')).length, 1);
  // o resto continua: ofertas com preço, link do /upgrade como alternativa e a data
  assert.match(text, /^• Pro \(US\$9\.97\/month · R\$49,97\/mês\)/m);
  assert.match(text, /See all options: https:\/\/sunoboard\.com\/upgrade\?kind=music&src=mcp/);
  assert.match(text, /your credits reset on Nov 1/);
  assert.match(text, /give the user the one-click link first/);
});

test('formatQuotaExceeded: checkoutUrl só da oferta recomendada também vira a 1ª ação', () => {
  const go = 'https://api.sunoboard.com/billing/go?t=xyz';
  const text = formatQuotaExceeded({ ...body, offers: [{ ...body.offers![0], checkoutUrl: go }, body.offers![1]] }, WEB);
  assert.match(text, new RegExp(`Upgrade in one click: ${go.replace(/[.?]/g, '\\$&')}`));
});

test('formatQuotaExceeded: ignora checkoutUrl fora da API da SunoBoard (mantém o texto antigo)', () => {
  const text = formatQuotaExceeded({ ...body, checkoutUrl: 'https://evil.example.com/billing/go?t=1' }, WEB);
  assert.doesNotMatch(text, /evil/);
  assert.match(text, /Upgrade in one click: https:\/\/sunoboard\.com\/upgrade\?kind=music&src=mcp/);
  assert.match(text, /Keep creating right now:/);
});

test('formatQuotaExceeded: SFX usa kind=sfx no link; sem ofertas mostra só link e data', () => {
  const text = formatQuotaExceeded({ ...body, kind: 'sfx', plan: 'studio', limit: 1000, offers: [] }, WEB);
  assert.match(text, /all 1,000 sound effects on the Studio plan/);
  assert.match(text, /your sound effects reset on/);
  assert.match(text, /upgrade\?kind=sfx&src=mcp/);
  assert.doesNotMatch(text, /Keep creating right now/);
});

test('formatQuotaNotice: silencioso com folga ou BYOK', () => {
  assert.equal(formatQuotaNotice({ plan: 'free', used: 1, limit: 5, bonus: 0, remaining: 4 }, WEB), undefined);
  assert.equal(formatQuotaNotice({ unlimited: true }, WEB), undefined);
  assert.equal(formatQuotaNotice(null, WEB), undefined);
});

test('formatQuotaNotice: com ≤ 2 restantes inclui o link de upgrade', () => {
  const two = formatQuotaNotice({ plan: 'free', used: 3, limit: 5, bonus: 0, remaining: 2, resetsAt: body.resetsAt }, WEB);
  assert.match(two!, /2 credits left this month \(up to 4 songs with Suno\), resets Nov 1\. Get more: https:\/\/sunoboard\.com\/upgrade\?kind=music&src=mcp/);
  const one = formatQuotaNotice({ plan: 'free', used: 4, limit: 5, bonus: 0, remaining: 1 }, WEB);
  assert.match(one!, /^Heads up: 1 credit left this month \(up to 2 songs with Suno\)/);
});

test('formatQuotaNotice: última geração cita as ofertas e o link', () => {
  const last = formatQuotaNotice({ plan: 'free', used: 5, limit: 5, bonus: 0, remaining: 0, offers: body.offers }, WEB);
  assert.match(last!, /^You've used all 5 credits on the Free plan this month/);
  assert.match(last!, /Pro US\$9\.97\/month or 40-credit pack US\$4\.99/);
  assert.match(last!, /upgrade\?kind=music&src=mcp/);
});

test('formatQuotaNotice: cota do plano usada mas com bônus de sobra → aviso sem link', () => {
  const n = formatQuotaNotice({ plan: 'free', used: 5, limit: 5, bonus: 10, remaining: 10 }, WEB);
  assert.equal(n, "Your plan's monthly credits are used up — this came from your bonus credits (10 left).");
});

test('formatUsageSummary (get_usage): créditos que sobram + equivalência Suno', () => {
  assert.equal(
    formatUsageSummary({ plan: 'pro', used: 14, limit: 100, bonus: 0, remaining: 86, resetsAt: body.resetsAt }),
    '86 credits left this month (up to 172 songs with Suno) · resets Nov 1. Each model costs a different number of credits (Suno: 1 credit → 2 songs) — call list_models to compare.',
  );
  assert.match(formatUsageSummary({ plan: 'free', used: 5, limit: 5, bonus: 3, remaining: 3 })!, /^3 credits left this month \(up to 6 songs with Suno; includes 3 bonus credits that never expire\)/);
  assert.equal(
    formatUsageSummary({ unlimited: true, otherModels: { plan: 'pro', used: 14, limit: 100, bonus: 0, remaining: 86, resetsAt: body.resetsAt } }),
    'Suno songs are unlimited with your own Suno key. Other models use your plan credits: 86 credits left this month · resets Nov 1.',
  );
  assert.equal(formatUsageSummary(null), undefined);
});

test('integração: generate_music do suno-mcp-core recebendo 402 da API → texto amigável', async () => {
  const { createHandlers } = await import('@yellowkode/suno-mcp-core');
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ statusCode: 402, ...body }), { status: 402, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  try {
    const h = createHandlers({ apiKey: 'sb_x', baseUrl: 'https://api.sunoboard.com', apiType: 'sunoboard' });
    const err = await h.generateMusic({ prompt: 'lofi' } as any).catch((e: unknown) => e);
    const p = parseQuotaExceeded(err);
    assert.ok(p, `não reconheceu: ${(err as Error)?.message}`);
    assert.match(formatQuotaExceeded(p, WEB), /Upgrade in one click: https:\/\/sunoboard\.com\/upgrade\?kind=music&src=mcp/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('formatRewardNotice: só quando as missões estão feitas e a recompensa não foi resgatada', () => {
  assert.equal(formatRewardNotice(undefined), undefined);
  assert.equal(formatRewardNotice({ onboarding: { rewardReady: false } }), undefined);
  assert.equal(formatRewardNotice({ onboarding: { rewardReady: true, claimed: true } }), undefined);
  const msg = formatRewardNotice({ onboarding: { rewardReady: true, claimed: false, reward: 3, claimUrl: 'https://sunoboard.com/dashboard' } })!;
  assert.match(msg, /claim 3 free credits at https:\/\/sunoboard\.com\/dashboard/);
  // link fora do domínio nunca vai para o chat
  assert.match(formatRewardNotice({ onboarding: { rewardReady: true, claimUrl: 'https://evil.example/x' } })!, /https:\/\/sunoboard\.com\/dashboard/);
});
