import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import WebSocket, { WebSocketServer } from "ws";
import { Client as SshClient, SFTPWrapper } from "ssh2";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as http from "http";

// ── Config ───────────────────────────────────────────────────────────────────

const GATEWAY_WS_URL = process.env.OPENCLAW_WS_URL ?? "ws://192.168.0.174:18789";
const GATEWAY_TOKEN = process.env.OPENCLAW_TOKEN ?? "";
const SSH_HOST = process.env.OPENCLAW_SSH_HOST ?? "192.168.0.174";
const SSH_USER = process.env.OPENCLAW_SSH_USER ?? "maxwalks";
const SSH_PASS = process.env.OPENCLAW_SSH_PASS ?? "";
const SESSIONS_PATH =
  process.env.OPENCLAW_SESSIONS_PATH ??
  "/home/maxwalks/.openclaw/agents/main/sessions";
const RELAY_PORT = parseInt(process.env.RELAY_PORT ?? "3001", 10);

// ── Types ────────────────────────────────────────────────────────────────────

export type DashboardEventType =
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "lifecycle"
  | "llm_text"
  | "exec"
  | "log"
  | "status";

export interface DashboardEvent {
  id: string;
  type: DashboardEventType;
  timestamp: string;
  agentId?: string;
  sessionId?: string;
  data: {
    // thinking
    text?: string;
    // tool_call
    toolName?: string;
    toolCallId?: string;
    args?: Record<string, unknown>;
    // tool_result
    result?: string;
    isError?: boolean;
    // exec
    command?: string;
    output?: string;
    // lifecycle
    phase?: "start" | "end" | "error";
    message?: string;
    // llm_text
    delta?: string;
    // status / generic
    label?: string;
    model?: string;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function emit(event: DashboardEvent) {
  const payload = JSON.stringify(event);
  for (const client of browserClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function makeEvent(
  type: DashboardEventType,
  data: DashboardEvent["data"],
  extras: Partial<DashboardEvent> = {}
): DashboardEvent {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    ...extras,
    data,
  };
}

// ── Browser WS server ────────────────────────────────────────────────────────

const browserClients = new Set<WebSocket>();
const httpServer = http.createServer();
const browserWss = new WebSocketServer({ server: httpServer });

browserWss.on("connection", (ws) => {
  browserClients.add(ws);
  log(`browser connected (${browserClients.size} total)`);

  // Send current connection status
  ws.send(
    JSON.stringify(
      makeEvent("status", {
        label: gatewayConnected ? "connected" : "disconnected",
      })
    )
  );

  ws.on("close", () => {
    browserClients.delete(ws);
    log(`browser disconnected (${browserClients.size} remaining)`);
  });
});

httpServer.listen(RELAY_PORT, () => {
  log(`relay listening on ws://localhost:${RELAY_PORT}`);
});

// ── Logging ──────────────────────────────────────────────────────────────────

function log(...args: unknown[]) {
  console.log(`[relay ${new Date().toISOString()}]`, ...args);
}

// ── Gateway WS connector ─────────────────────────────────────────────────────

let gatewayWs: WebSocket | null = null;
let gatewayConnected = false;
let reconnectDelay = 2000;
const pendingRpcs = new Map<string, (res: unknown) => void>();
// Pending tool calls waiting for result: toolCallId → event
const pendingToolCalls = new Map<string, DashboardEvent>();

function connectToGateway() {
  log(`connecting to gateway: ${GATEWAY_WS_URL}`);
  const ws = new WebSocket(GATEWAY_WS_URL);
  gatewayWs = ws;

  ws.on("open", () => {
    log("gateway WS open — sending connect frame");
    sendConnectFrame(ws);
  });

  ws.on("message", (raw) => {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }
    handleGatewayFrame(frame);
  });

  ws.on("error", (err) => {
    log("gateway WS error:", err.message);
  });

  ws.on("close", (code) => {
    log(`gateway WS closed (${code})`);
    gatewayConnected = false;
    gatewayWs = null;
    emit(makeEvent("status", { label: "disconnected" }));
    // Reconnect with backoff
    reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
    setTimeout(connectToGateway, reconnectDelay);
  });
}

function sendConnectFrame(ws: WebSocket) {
  const frame = {
    type: "req",
    id: randomUUID(),
    method: "connect",
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "cli",
        version: "1.0.0",
        platform: "linux",
        mode: "cli",
      },
      role: "operator",
      scopes: ["operator.read", "operator.write", "operator.admin"],
      caps: ["tool-events"],
      auth: { token: GATEWAY_TOKEN },
    },
  };
  ws.send(JSON.stringify(frame));
}

function rpc(method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!gatewayWs || gatewayWs.readyState !== WebSocket.OPEN) {
      reject(new Error("gateway not connected"));
      return;
    }
    const id = randomUUID();
    const timeout = setTimeout(() => {
      pendingRpcs.delete(id);
      reject(new Error(`RPC timeout: ${method}`));
    }, 10000);
    pendingRpcs.set(id, (res) => {
      clearTimeout(timeout);
      resolve(res);
    });
    gatewayWs.send(JSON.stringify({ type: "req", id, method, params }));
  });
}

function handleGatewayFrame(frame: Record<string, unknown>) {
  const type = frame.type as string;

  // Resolve pending RPCs
  if (type === "res") {
    const id = frame.id as string;
    const resolver = pendingRpcs.get(id);
    if (resolver) {
      pendingRpcs.delete(id);
      resolver(frame);
    }
    // Handle hello-ok
    const payload = frame.payload as Record<string, unknown> | undefined;
    if (payload?.type === "hello-ok") {
      onGatewayConnected();
    }
    return;
  }

  if (type !== "event") return;
  const event = frame.event as string;
  const payload = frame.payload as Record<string, unknown> | undefined;

  // Skip noisy housekeeping events
  if (event === "tick" || event === "health") return;

  // Agent lifecycle
  if (event === "agent.start" || event === "agent.end") {
    emit(
      makeEvent(
        "lifecycle",
        {
          phase: event === "agent.start" ? "start" : "end",
          message: event === "agent.start" ? "Agent started" : "Agent finished",
          label: payload?.agentId as string | undefined,
        },
        { agentId: payload?.agentId as string | undefined }
      )
    );
    return;
  }

  // Tool events (requires tool-events cap)
  if (event === "tool.start") {
    const toolName = payload?.tool as string;
    const toolCallId = payload?.toolCallId as string;
    const input = payload?.input as Record<string, unknown> | undefined;
    const ev = makeEvent(
      toolName === "exec" ? "exec" : "tool_call",
      {
        toolName,
        toolCallId,
        args: input,
        command:
          toolName === "exec"
            ? (input?.command as string | undefined)
            : undefined,
      },
      { agentId: payload?.agentId as string | undefined }
    );
    pendingToolCalls.set(toolCallId, ev);
    emit(ev);
    return;
  }

  if (event === "tool.end") {
    const toolCallId = payload?.toolCallId as string;
    const toolName = payload?.tool as string;
    const output = payload?.output;
    const isError = payload?.isError as boolean | undefined;
    emit(
      makeEvent(
        "tool_result",
        {
          toolCallId,
          toolName,
          result:
            typeof output === "string"
              ? output
              : JSON.stringify(output ?? "", null, 2),
          isError: isError ?? false,
        },
        { agentId: payload?.agentId as string | undefined }
      )
    );
    pendingToolCalls.delete(toolCallId);
    return;
  }

  // LLM streaming text
  if (event === "assistant.delta" || event === "stream.assistant") {
    const delta = (payload?.delta ?? payload?.text) as string | undefined;
    if (delta) {
      emit(
        makeEvent("llm_text", { delta }, { agentId: payload?.agentId as string | undefined })
      );
    }
    return;
  }

  // Catch-all for unknown events — log them
  log("unhandled gateway event:", event, JSON.stringify(payload ?? {}).slice(0, 200));
}

async function onGatewayConnected() {
  log("gateway authenticated");
  gatewayConnected = true;
  reconnectDelay = 2000;
  emit(makeEvent("status", { label: "connected" }));

  // Get active agents
  try {
    const res = (await rpc("agents.list", {})) as Record<string, unknown>;
    log("agents:", JSON.stringify(res).slice(0, 200));
  } catch (e) {
    log("agents.list failed:", e);
  }
}

// ── SSH JSONL watcher (thinking supplement) ──────────────────────────────────

let sshClient: SshClient | null = null;
let sshReady = false;
let currentSessionFile: string | null = null;
let jsonlOffset = 0;
// Track which thinking blocks we've already emitted (by thinkingSignature)
const emittedThinking = new Set<string>();

function connectSsh() {
  log("SSH connecting...");
  const client = new SshClient();
  sshClient = client;

  client.on("ready", () => {
    log("SSH connected");
    sshReady = true;
    pollLatestSession();
  });

  client.on("error", (err) => {
    log("SSH error:", err.message);
    sshReady = false;
  });

  client.on("close", () => {
    log("SSH closed — reconnecting in 10s");
    sshReady = false;
    sshClient = null;
    setTimeout(connectSsh, 10000);
  });

  client.connect({
    host: SSH_HOST,
    port: 22,
    username: SSH_USER,
    password: SSH_PASS,
    readyTimeout: 15000,
  });
}

function pollLatestSession() {
  if (!sshReady || !sshClient) return;

  sshClient.sftp((err, sftp) => {
    if (err) {
      log("SFTP error:", err.message);
      return;
    }
    findLatestSession(sftp);
  });
}

function findLatestSession(sftp: SFTPWrapper) {
  sftp.readdir(SESSIONS_PATH, (err, list) => {
    if (err) {
      log("readdir error:", err.message);
      sftp.end();
      setTimeout(pollLatestSession, 5000);
      return;
    }

    const jsonlFiles = list
      .filter((f) => f.filename.endsWith(".jsonl"))
      .sort((a, b) => (b.attrs.mtime ?? 0) - (a.attrs.mtime ?? 0));

    if (jsonlFiles.length === 0) {
      sftp.end();
      setTimeout(pollLatestSession, 5000);
      return;
    }

    const latest = jsonlFiles[0].filename;
    const latestPath = `${SESSIONS_PATH}/${latest}`;

    if (latestPath !== currentSessionFile) {
      log("new session file detected:", latest);
      currentSessionFile = latestPath;
      jsonlOffset = 0;
      emittedThinking.clear();
      emit(makeEvent("lifecycle", { phase: "start", message: `Session: ${latest.replace(".jsonl", "").substring(0, 8)}...`, label: latest }));
    }

    tailJsonlFile(sftp, latestPath);
  });
}

function tailJsonlFile(sftp: SFTPWrapper, filePath: string) {
  sftp.stat(filePath, (err, stats) => {
    if (err) {
      sftp.end();
      setTimeout(pollLatestSession, 3000);
      return;
    }

    const fileSize = stats.size;
    if (fileSize <= jsonlOffset) {
      // No new data — check again soon
      sftp.end();
      setTimeout(pollLatestSession, 1500);
      return;
    }

    const stream = sftp.createReadStream(filePath, {
      start: jsonlOffset,
      end: fileSize - 1,
    });

    const chunks: Buffer[] = [];
    stream.on("data", (d: Buffer) => chunks.push(d));
    stream.on("end", () => {
      jsonlOffset = fileSize;
      sftp.end();

      const newData = Buffer.concat(chunks).toString("utf8");
      const lines = newData.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        parseJsonlLine(line);
      }

      // Keep polling
      setTimeout(pollLatestSession, 1500);
    });
    stream.on("error", () => {
      sftp.end();
      setTimeout(pollLatestSession, 3000);
    });
  });
}

function parseJsonlLine(line: string) {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line);
  } catch {
    return;
  }

  const type = obj.type as string;

  if (type === "message") {
    const msg = obj.message as Record<string, unknown> | undefined;
    if (!msg) return;
    const role = msg.role as string;

    if (role === "assistant") {
      const content = msg.content as Array<Record<string, unknown>> | undefined;
      if (!content) return;

      for (const block of content) {
        const blockType = block.type as string;

        // Thinking block
        if (blockType === "thinking") {
          const sig = block.thinkingSignature as string | undefined;
          // Deduplicate by signature
          if (sig && emittedThinking.has(sig)) continue;
          if (sig) emittedThinking.add(sig);

          emit(
            makeEvent("thinking", {
              text: block.thinking as string,
            })
          );
        }

        // Tool calls (supplement — gateway WS tool events are primary)
        // Only emit if the tool event wasn't already received via WS
        if (blockType === "toolCall") {
          const id = block.id as string;
          if (!pendingToolCalls.has(id)) {
            const name = block.name as string;
            const args = block.arguments as Record<string, unknown> | undefined;
            emit(
              makeEvent(name === "exec" ? "exec" : "tool_call", {
                toolCallId: id,
                toolName: name,
                args,
                command:
                  name === "exec"
                    ? (args?.command as string | undefined)
                    : undefined,
              })
            );
          }
        }
      }

      // Model info
      const model = msg.model as string | undefined;
      if (model) {
        emit(makeEvent("status", { label: "model", model }));
      }
    }

    if (role === "toolResult") {
      const toolName = msg.toolName as string | undefined;
      const toolCallId = msg.toolCallId as string | undefined;
      const content = msg.content as Array<Record<string, unknown>> | undefined;
      const isError = msg.isError as boolean | undefined;
      const resultText = content?.map((c) => c.text ?? "").join("\n") ?? "";

      emit(
        makeEvent("tool_result", {
          toolName,
          toolCallId,
          result: resultText.slice(0, 2000),
          isError: isError ?? false,
        })
      );
    }
  }

  if (type === "model_change") {
    const modelId = obj.modelId as string | undefined;
    if (modelId) emit(makeEvent("status", { label: "model", model: modelId }));
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

log("starting OpenClaw Dashboard relay");
connectToGateway();
connectSsh();
