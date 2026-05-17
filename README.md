# @yellowkode/suno-mcp

> MCP Server for Suno AI — Generate music directly from Claude, VSCode, Cursor, and any MCP-compatible client.

**by [YellowKode Academy](https://yellowkode.com)** · [sunoboard.com](https://sunoboard.com)

[![npm version](https://badge.fury.io/js/%40yellowkode%2Fsuno-mcp.svg)](https://www.npmjs.com/package/@yellowkode/suno-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What is this?

`@yellowkode/suno-mcp` is an open-source [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that connects **Claude and other AI assistants** directly to the Suno AI music generation API.

Instead of manually calling the API, you can just tell Claude:

> *"Generate a dark ambient viking instrumental, slow drums, cinematic, no vocals"*

...and Claude handles the full generation flow automatically.

---

## Prerequisites

- **Node.js 18+**
- A **Suno API key** — two options:

| Option | Key format | Where to get |
|--------|-----------|--------------|
| **SunoBoard** (recommended) | `sb_...` | [sunoboard.com](https://sunoboard.com) — generations saved to your dashboard |
| **sunoapi.org** (BYOK) | `e57efd1b...` | [sunoapi.org](https://sunoapi.org) → Dashboard → API Keys |

The server **auto-detects** which API to use based on the key prefix. No extra config needed.

---

## Quick start

```bash
# One-shot (no install needed)
SUNO_API_KEY=your_key npx @yellowkode/suno-mcp

# Or install globally
npm install -g @yellowkode/suno-mcp
```

---

## Setup

### Claude Desktop

Edit `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "suno": {
      "command": "npx",
      "args": ["@yellowkode/suno-mcp"],
      "env": {
        "SUNO_API_KEY": "your_key_here"
      }
    }
  }
}
```

### Claude Code (terminal)

```bash
claude mcp add suno \
  -e SUNO_API_KEY=your_key_here \
  -- npx @yellowkode/suno-mcp
```

### Cursor / Cline (VSCode)

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "suno": {
      "command": "npx",
      "args": ["@yellowkode/suno-mcp"],
      "env": {
        "SUNO_API_KEY": "your_key_here"
      }
    }
  }
}
```

---

## Available Tools

| Tool | Description |
|------|-------------|
| `generate_music` | Start music generation — returns a `taskId` |
| `get_music_status` | Check generation status by `taskId` |
| `wait_for_music` | Auto-poll until ready, returns audio URL (up to 5 min) |
| `list_recent_music` | List recently generated tracks |
| `get_credits` | Check remaining API credits |

### `generate_music` parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | required | Music description or lyrics (in custom mode) |
| `model` | string | `V4_5` | `V4` · `V4_5` · `V4_5PLUS` · `V4_5ALL` · `V5` · `V5_5` |
| `style` | string | — | Style tags e.g. `"ambient dark, slow drums"` |
| `title` | string | — | Track title (required in custom mode) |
| `instrumental` | boolean | `false` | Generate without vocals |
| `customMode` | boolean | `false` | Use `prompt` as literal lyrics |
| `vocalGender` | `"male"` \| `"female"` | — | Vocal preference (custom mode only) |
| `negativeTags` | string | — | Styles to avoid e.g. `"heavy metal"` |
| `styleWeight` | 0–1 | `0.5` | Style adherence |
| `weirdnessConstraint` | 0–1 | `0.5` | Creativity vs. predictability |
| `audioWeight` | 0–1 | `0.5` | Audio quality weight |

---

## Usage Examples

### Basic

> *"Generate a relaxing lo-fi hip hop track for studying"*

Claude calls `generate_music` → `wait_for_music` and returns the audio URL.

### Game development

> *"Generate dramatic battle music for an RPG boss fight, orchestral, no lyrics, intense"*

### Custom lyrics

> *"Generate a song with these lyrics: [paste lyrics], style: indie pop, female vocals"*

### With full control

> *"Generate music: prompt='cosmic meditation', style='deep space ambient, synth pads', model=V5, instrumental, weirdness=0.7"*

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUNO_API_KEY` | ✅ | — | Your API key (`sb_...` or sunoapi.org hash) |
| `SUNO_API_BASE_URL` | ❌ | auto-detected | Override API base URL |
| `MAX_POLL_ATTEMPTS` | ❌ | `30` | Max polls for `wait_for_music` |
| `POLL_INTERVAL_MS` | ❌ | `10000` | Polling interval in ms |

---

## Visual Dashboard

Want to manage all your generated music visually?

**[SunoBoard](https://sunoboard.com)** gives you:
- Full history with inline player
- Organize by project (e.g. "Game OST", "YouTube Channel")
- Download MP3
- Credit tracking
- Regenerate with same parameters

Use a `sb_` key to have all generations appear automatically in your dashboard.

---

## Contributing

```bash
git clone https://github.com/YellowKode-Academy/suno-mcp
cd suno-mcp
npm install
npm run dev
```

Tests: `npm test`

---

## License

MIT © [YellowKode Academy](https://yellowkode.com) · [Wunka Tech](https://wunka.tech)

*Built with ❤️ by [Kelvin Biffi](https://instagram.com/kelvinbiffi.negocios)*
