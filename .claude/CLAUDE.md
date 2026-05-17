# suno-mcp — Claude Context

## O que é este projeto
Pacote npm open source `@yellowkode/suno-mcp` que expõe a API do Suno AI como MCP Server.
Permite usar o Suno AI diretamente no Claude Desktop, Claude Code, VSCode com Cline, Cursor, etc.

Suporta dois tipos de chave:
- **`sb_...`** → SunoBoard API (`api.sunoboard.com`) — gerações aparecem no dashboard
- **`e57efd1b...`** → sunoapi.org direto (BYOK)

O servidor **auto-detecta** qual API usar com base no prefixo da chave.

**by YellowKode Academy** — github.com/YellowKode-Academy/suno-mcp

## Stack
- **Runtime:** Node.js 18+
- **Linguagem:** TypeScript (ESM)
- **SDK:** `@modelcontextprotocol/sdk`
- **Core:** `@yellowkode/suno-mcp-core` (via vendor tarball)
- **Entrypoint:** `src/index.ts` → compila para `dist/index.js`
- **Testes:** Vitest

## Estrutura relevante
```
src/
  index.ts      # MCP server + stdio transport
  config.ts     # detectApiBase() e isSunoBoardKey() — lógica pura, testável
  __tests__/
    config.test.ts    # 9 testes de detecção de URL
    startup.test.ts   # testes de processo (spawn dist/index.js)
vendor/
  yellowkode-suno-mcp-core-*.tgz   # tarball do core (npm pack)
```

## Comandos principais
```bash
npm run build      # Compila TypeScript → dist/
npm run dev        # Dev mode com tsx watch
npm test           # Roda testes Vitest
npm run start      # Executa dist/index.js
npm publish        # Publica no npm (roda build antes via prepublishOnly)
```

## Variáveis de ambiente
| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `SUNO_API_KEY` | ✅ | — | Chave `sb_...` (SunoBoard) ou hash sunoapi.org |
| `SUNO_API_BASE_URL` | ❌ | auto-detectado | Override da base URL da API |
| `MAX_POLL_ATTEMPTS` | ❌ | `30` | Tentativas máx de polling |
| `POLL_INTERVAL_MS` | ❌ | `10000` | Intervalo entre polls (ms) |

> `SUNO_API_BASE_URL` raramente é necessário — a detecção automática pelo prefixo `sb_` cobre os dois casos.

## Tools MCP expostas
| Tool | Descrição |
|------|-----------|
| `generate_music` | Inicia geração de música, retorna taskId |
| `get_music_status` | Verifica status por taskId |
| `wait_for_music` | Polling automático até completar, retorna audioUrl |
| `list_recent_music` | Lista gerações recentes |
| `get_credits` | Retorna créditos restantes |

## Modelos suportados
`V4` · `V4_5` · `V4_5PLUS` · `V4_5ALL` · `V5` · `V5_5`

## Fluxo da API
```
POST /api/v1/generate → { taskId, status: "PENDING" }
GET  /api/v1/generate/record-info?taskId=X → { status: "SUCCESS"|"PENDING"|"PROCESSING"|erro }
GET  /api/v1/credits → { remaining, total, used }
GET  /api/v1/generate/list?page=1&limit=20 → lista de gerações
```

## Status possíveis
`PENDING` → `PROCESSING` → `SUCCESS` / `SENSITIVE_WORD_ERROR` / `GENERATE_AUDIO_FAILED` / `CREATE_TASK_FAILED`

## Como testar localmente
```bash
npm install
npm run build
npm test
```

Para testar manualmente com uma chave real:
```bash
SUNO_API_KEY=sua_key node dist/index.js
```

## Como publicar no npm
Ver `/publish` command para o fluxo completo (inclui atualizar vendor tarball do core).

## Configuração no Claude Desktop
```json
{
  "mcpServers": {
    "suno": {
      "command": "npx",
      "args": ["@yellowkode/suno-mcp"],
      "env": { "SUNO_API_KEY": "sua_key_aqui" }
    }
  }
}
```

## Configuração no Claude Code (terminal)
```bash
claude mcp add suno \
  -e SUNO_API_KEY=sua_key_aqui \
  -- npx @yellowkode/suno-mcp
```
