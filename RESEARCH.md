# OpenClaw Dashboard Research

## What is OpenClaw

Self-hosted personal AI assistant platform. Runs locally as a **gateway server** + agent runtime. Installed via `npm install -g openclaw@latest`. Interfaces with messaging apps (Telegram, WhatsApp, etc.) and exposes a WebSocket API for clients.

---

## Architecture

```
Messaging Channels (Telegram, etc.)
            ↓
  Gateway WebSocket Server (:18789)
            ↓
    Agent Runtime (pi-agent-core)
    Claude Sonnet 4.6 (Anthropic)
```

- Gateway manages sessions, channels, tools, events, cron, memory, auth
- Agent is named `main`, sessions stored at `~/.openclaw/agents/main/sessions/`
- Control UI is a Vite SPA served from the gateway HTTP surface

---

## Remote Machine Details (192.168.0.174)

- Gateway process: `openclaw-gateway` (pid ~43080)
- Port: `18789`, bound to `0.0.0.0` (LAN-accessible, no tunnel needed)
- Auth mode: `token`
- Gateway token: `6e59092e8bee57e04c08f4456c4bd4e73d9c6e088fac79ec`
- Log files: `/tmp/openclaw/openclaw-YYYY-MM-DD.log`
- Session files: `~/.openclaw/agents/main/sessions/*.jsonl`
- Model: `anthropic/claude-sonnet-4-6`
- Thinking level: `low` (enabled)

---

## WebSocket Protocol

### Connection Flow
1. Open WS to `ws://192.168.0.174:18789`
2. Gateway sends `connect.challenge` with `{nonce, ts}` (can ignore)
3. Send connect frame immediately on open:

```json
{
  "type": "req",
  "id": "<uuid>",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "cli",
      "version": "1.0.0",
      "platform": "linux",
      "mode": "cli"
    },
    "role": "operator",
    "scopes": ["operator.read", "operator.write", "operator.admin"],
    "caps": ["tool-events"],
    "auth": { "token": "<gateway_token>" }
  }
}
```

4. Receive `hello-ok` response → authenticated

### Client IDs (enum)
`webchat-ui`, `openclaw-control-ui`, `webchat`, `cli`, `gateway-client`, `openclaw-macos`, `openclaw-ios`, `openclaw-android`, `node-host`, `test`, `fingerprint`, `openclaw-probe`

> Note: `openclaw-control-ui` requires origin check (must come from `http://192.168.0.174:18789`). Use `cli` instead.

### Client Modes (enum)
`webchat`, `cli`, `ui`, `backend`, `node`, `probe`, `test`

### Scopes
- `operator.read` — read-only access
- `operator.write` — write access
- `operator.admin` — admin (supersedes all operator scopes)

### Capabilities
- `tool-events` — enables tool event streaming

### Frame Formats
```ts
// Request
{ type: "req", id: string, method: string, params?: unknown }

// Response
{ type: "res", id: string, ok: boolean, payload?: unknown, error?: { code, message } }

// Event
{ type: "event", event: string, payload: unknown, seq?: number, stateVersion?: number }
```

---

## Session JSONL Event Schema (confirmed from live data)

Session files at `~/.openclaw/agents/main/sessions/<uuid>.jsonl`:

```jsonl
{"type":"session","version":3,"id":"...","timestamp":"...","cwd":"/home/maxwalks/.openclaw/workspace"}
{"type":"model_change","id":"...","provider":"anthropic","modelId":"claude-sonnet-4-6"}
{"type":"thinking_level_change","thinkingLevel":"low"}
{"type":"message","role":"user","message":{"role":"user","content":[{"type":"text","text":"..."}]}}
{"type":"message","role":"assistant","message":{
  "role":"assistant",
  "content":[
    {"type":"thinking","thinking":"Let me gather...","thinkingSignature":"..."},
    {"type":"toolCall","id":"toolu_...","name":"web_search","arguments":{"query":"..."}},
    {"type":"toolCall","id":"toolu_...","name":"web_fetch","arguments":{"url":"..."}}
  ],
  "model":"claude-sonnet-4-6",
  "usage":{"input":3,"output":344,"totalTokens":14562,"cost":{"total":0.058}}
}}
{"type":"message","role":"toolResult","message":{
  "toolCallId":"toolu_...","toolName":"web_search",
  "content":[{"type":"text","text":"..."}],
  "isError":false
}}
```

### Thinking Confirmed Available
`thinkingLevel: "low"` is set in the config. Thinking blocks appear as:
```json
{"type": "thinking", "thinking": "Let me gather all the information...", "thinkingSignature": "EvkBCk..."}
```

---

## Available Gateway RPC Methods

From `hello-ok` features list:
- `health` — gateway health snapshot
- `logs.tail` — real-time log streaming
- `status` — general status
- `agents.list` — list active agents
- `agents.sessions.*` — session management
- `config.get/set/patch` — config
- `exec.approvals.*` — exec approval management
- `models.list` — list available models
- `tools.catalog` — tool catalog
- `usage.cost` / `usage.status` — token usage

---

## Existing Dashboard Projects (reference)

1. **openclaw-studio** (Next.js) — proxies WS, shows agents/chat/approvals
2. **clawmetry** (Python/Flask) — filesystem-based monitoring, port 8900
3. **openclaw-dashboard** (Node.js) — filesystem-based, port 7000

---

## Dashboard Implementation Strategy

**Chosen: Hybrid approach**
1. **Gateway WS** (primary) — real-time tool events, lifecycle, LLM deltas
2. **SSH + JSONL tail** (supplement) — thinking text, session history

**Why hybrid**: WS gives real-time feed; JSONL gives guaranteed thinking text and full session replay.

**Stack**: Next.js 15, TypeScript, Tailwind, `ws` npm package for relay, `ssh2` for JSONL tailing.
