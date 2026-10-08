// Testes do MCP hospedado: node --import tsx --test (sem dependência extra)
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { toolSchemas } from '@yellowkode/suno-mcp-core';
import {
  FALLBACK_CATALOG,
  McpCatalog,
  costFor,
  extendToolSchemas,
  formatModelList,
  modelNotice,
  normalizeMusicModel,
  sunoLegacyValue,
} from '../sunoboard/models.js';

const catalog: McpCatalog = {
  ...FALLBACK_CATALOG,
  music: [
    ...FALLBACK_CATALOG.music,
    { id: 'elevenlabs-music', label: 'ElevenLabs Music', kind: 'music', quotaCost: 4, costPerSeconds: 16, defaultDurationSec: 60, minDurationSec: 10, maxDurationSec: 180 },
  ],
  userDefaults: { music: { id: 'suno-v4_5' }, sfx: { id: 'elevenlabs-sfx' } },
};

const sfxTool = { name: 'generate_sfx', description: 'sfx', inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } };

test('generate_music ganha `model` com ids do catálogo + legados, sem perder os campos do pacote', () => {
  const tools = extendToolSchemas([...toolSchemas, sfxTool] as any[], catalog);
  const gm = tools.find((t) => t.name === 'generate_music')!;
  const model = gm.inputSchema.properties.model;
  for (const id of ['suno-v4_5', 'lyria-3-pro', 'minimax-2.6', 'stable-audio-2.5', 'elevenlabs-music', 'V4', 'V4_5', 'V5_5']) {
    assert.ok(model.enum.includes(id), id);
  }
  assert.match(model.description, /default/i);
  assert.match(model.description, /Options \(credits → what you get\)/);
  assert.match(model.description, /suno-v4_5 = Suno V4\.5 \(1 credit → 2 songs;/);
  assert.match(model.description, /lyria-3-pro = Google Lyria 3 Pro \(2 credits → 1 track;/);
  assert.match(model.description, /minimax-2\.6 = MiniMax Music 2\.6 \(4 credits → 1 song, exact lyrics;/);
  assert.match(model.description, /stable-audio-2\.5 = Stable Audio 2\.5 \(5 credits → 1 long instrumental;/);
  assert.match(model.description, /elevenlabs-music = ElevenLabs Music \(4 credits → 60 s by default, 1 credit per 16 s;/);
  assert.match(gm.description, /Suno: 1 credit → 2 songs/);
  assert.doesNotMatch(`${gm.description} ${model.description} ${gm.inputSchema.properties.duration_seconds.description}`, /generation/i);
  assert.ok(gm.inputSchema.properties.duration_seconds, 'duration_seconds');
  assert.ok(gm.inputSchema.properties.prompt && gm.inputSchema.properties.customMode);
  assert.deepEqual(gm.inputSchema.required, ['prompt']);
  // não altera o objeto original do pacote npm
  const original = (toolSchemas as unknown as any[]).find((t) => t.name === 'generate_music');
  assert.ok(!original.inputSchema.properties.model.enum.includes('lyria-3-pro'));
});

test('generate_sfx ganha `model` com os ids de efeitos', () => {
  const sfx = extendToolSchemas([sfxTool] as any[], catalog)[0];
  assert.deepEqual(sfx.inputSchema.properties.model.enum, ['elevenlabs-sfx', 'tangoflux', 'stable-audio-ambience']);
  assert.match(sfx.inputSchema.properties.model.description, /stable-audio-ambience = .*\(5 credits → 1 ambience\/loop up to 60 s;/);
  assert.match(sfx.inputSchema.properties.model.description, /elevenlabs-sfx = ElevenLabs SFX \(1 sound effect;/);
  assert.doesNotMatch(sfx.inputSchema.properties.model.description, /generation/i);
});

test('aviso de modelo: padrão Suno V4.5 — custo → resultado e saldo em créditos', () => {
  const text = modelNotice({ kind: 'music', catalog, modelId: 'suno-v4_5', isDefault: true, cost: 1, remaining: 85 });
  assert.equal(
    text,
    '🎛️ Model: Suno V4.5 — your default · 1 credit → 2 songs. 85 credits left. Change your default at https://sunoboard.com/settings#models or ask me for: lyria-3-pro (2 credits → 1 track), minimax-2.6 (4 credits → 1 song, exact lyrics), stable-audio-2.5 (5 credits → 1 long instrumental), elevenlabs-music (4 credits → 60 s).',
  );
  // sem saldo conhecido (BYOK + Suno) não inventa número
  assert.doesNotMatch(modelNotice({ kind: 'music', catalog, modelId: 'suno-v4_5', isDefault: true, cost: 1 }), /left/);
  assert.match(modelNotice({ kind: 'music', catalog, modelId: 'suno-v4_5', isDefault: true, cost: 1, remaining: 1 }), / 1 credit left\./);
});

test('aviso de modelo: escolhido no pedido, mostra o padrão e oferece o Suno', () => {
  const text = modelNotice({ kind: 'music', catalog, modelId: 'minimax-2.6', isDefault: false, cost: 4, defaultLabel: 'Suno V4.5' });
  assert.match(text, /^🎛️ Model: MiniMax Music 2\.6 — picked for this request; your default is Suno V4\.5 · 4 credits → 1 song with your exact lyrics\. Change/);
  assert.match(text, /suno-v4_5 \(1 credit → 2 songs\)/);
  assert.match(text, /elevenlabs-music \(4 credits → 60 s\)/);
  // ElevenLabs Music: o resultado acompanha a duração pedida
  const el = modelNotice({ kind: 'music', catalog, modelId: 'elevenlabs-music', isDefault: false, cost: 6, durationSec: 90 });
  assert.match(el, /· 6 credits → 1 track of 90 s\./);
  assert.ok(!text.includes('minimax-2.6 ('));
});

test('aviso de efeitos: contam como efeitos; ambience cobra créditos', () => {
  const def = modelNotice({ kind: 'sfx', catalog, modelId: 'elevenlabs-sfx', isDefault: true, cost: 1, remaining: 290 });
  assert.match(def, /^🎛️ Model: ElevenLabs SFX — your default · 1 sound effect\. 290 sound effects left\. Change your default at https:\/\/sunoboard\.com\/settings#models/);
  assert.match(def, /tangoflux \(1 sound effect, cheaper\)/);
  assert.match(def, /stable-audio-ambience \(5 credits → 1 ambience\/loop up to 60 s\)/);
  const amb = modelNotice({ kind: 'sfx', catalog, modelId: 'stable-audio-ambience', isDefault: false, cost: 5, remaining: 80 });
  assert.match(amb, /· 5 credits → 1 ambience\/loop up to 60 s \(doesn't use your sound-effect allowance\)\. 80 credits left\./);
  assert.doesNotMatch(`${def} ${amb}`, /generation/i);
});

test('modelos: legado e custo por duração', () => {
  assert.equal(normalizeMusicModel('V4_5'), 'suno-v4_5');
  assert.equal(normalizeMusicModel('Lyria-3-Pro'), 'lyria-3-pro');
  assert.equal(normalizeMusicModel(''), undefined);
  assert.equal(sunoLegacyValue('suno-v5_5'), 'V5_5');
  const el = catalog.music.find((m) => m.id === 'elevenlabs-music');
  assert.equal(costFor(el, 30), 2);
  assert.equal(costFor(el, 90), 6);
  assert.equal(costFor(el, 999), 12);
  assert.equal(costFor(el), 4);
});

test('list_models mostra custo, melhor uso e padrões do usuário', () => {
  const out = formatModelList({ ...catalog, userDefaults: { music: { id: 'lyria-3-pro' }, sfx: { id: 'elevenlabs-sfx' } } });
  assert.deepEqual(out.yourDefaults, { music: 'lyria-3-pro', sfx: 'elevenlabs-sfx' });
  const lyria = out.music.find((m) => m.id === 'lyria-3-pro')!;
  assert.equal(lyria.cost, '2 credits → 1 track (up to ~3 min)');
  assert.equal(lyria.yourDefault, true);
  assert.equal(out.music.find((m) => m.id === 'suno-v4_5')!.recommended, true);
  assert.equal(out.music.find((m) => m.id === 'suno-v4_5')!.cost, '1 credit → 2 songs');
  assert.equal(out.music.find((m) => m.id === 'minimax-2.6')!.cost, '4 credits → 1 song with your exact lyrics');
  assert.equal(out.music.find((m) => m.id === 'stable-audio-2.5')!.cost, '5 credits → 1 long instrumental (up to 3 min)');
  assert.equal(out.music.find((m) => m.id === 'elevenlabs-music')!.cost, '4 credits → 1 track of 60 s (1 credit per 16 s, length 10–180 s)');
  assert.equal(out.soundEffects.find((m) => m.id === 'elevenlabs-sfx')!.cost, '1 sound effect');
  assert.equal(out.soundEffects.find((m) => m.id === 'stable-audio-ambience')!.cost, "5 credits → 1 ambience/loop up to 60 s (doesn't use your sound-effect allowance)");
  assert.match(out.howCostsWork, /Suno: 1 credit → 2 songs/);
  assert.doesNotMatch(JSON.stringify(out), /generation/i);
  assert.match(out.howToChange, /settings#models/);
});

test('modelo indisponível (cota do mês esgotada) aparece assim no list_models e some das sugestões', () => {
  const down: McpCatalog = {
    ...catalog,
    music: catalog.music.map((m) =>
      m.id === 'elevenlabs-music' ? { ...m, available: false, unavailableReason: 'ElevenLabs Music is temporarily unavailable this month — try Suno or Lyria.' } : m,
    ),
  };
  const el = formatModelList(down).music.find((m) => m.id === 'elevenlabs-music')!;
  assert.equal(el.available, false);
  assert.match(String((el as any).unavailableReason), /this month/);
  const text = modelNotice({ kind: 'music', catalog: down, modelId: 'suno-v4_5', isDefault: true, cost: 1 });
  assert.ok(!text.includes('elevenlabs-music'));
  const gm = extendToolSchemas([...toolSchemas] as any[], down).find((t) => t.name === 'generate_music')!;
  assert.ok(gm.inputSchema.properties.model.description.includes('pick the length; UNAVAILABLE right now)'));
  assert.ok(gm.inputSchema.properties.model.description.includes('elevenlabs-music = ElevenLabs Music (4 credits → 60 s by default, 1 credit per 16 s;'));
});
