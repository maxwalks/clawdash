"use client";

import { useState } from "react";
import type { DashboardEvent } from "../hooks/useEventStream";

function ts(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function ArgValue({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return <span className="text-oc-text">{value.slice(0, 500)}</span>;
  }
  return (
    <span className="text-oc-muted">{JSON.stringify(value, null, 2)}</span>
  );
}

function Collapsible({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-oc-muted hover:text-oc-text flex items-center gap-1 mt-2 transition-colors"
      >
        <span
          className="inline-block transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ▶
        </span>
        {label}
      </button>
      {open && (
        <div className="mt-2 rounded bg-black/30 p-3 text-xs font-mono text-oc-text overflow-auto max-h-64">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Card variants ────────────────────────────────────────────────────────────

function ThinkingCard({ event }: { event: DashboardEvent }) {
  return (
    <div className="card border-l-2 border-oc-muted/40">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">💭</span>
        <span className="text-xs font-semibold text-oc-muted uppercase tracking-wide">
          Thinking
        </span>
        <span className="text-xs text-oc-muted/60 ml-auto">{ts(event.timestamp)}</span>
      </div>
      <p className="text-sm text-oc-text/80 leading-relaxed whitespace-pre-wrap font-mono">
        {event.data.text}
      </p>
    </div>
  );
}

function ToolCard({ event }: { event: DashboardEvent }) {
  const isExec = event.type === "exec";
  return (
    <div className={`card border-l-2 ${isExec ? "border-green-600/60" : "border-blue-500/60"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{isExec ? "💻" : "🔧"}</span>
        <span className="text-xs font-semibold text-oc-muted uppercase tracking-wide">
          {isExec ? "Exec" : "Tool"}
        </span>
        <span className="font-mono text-sm font-bold text-oc-text">
          {event.data.toolName}
        </span>
        <span className="text-xs text-oc-muted/60 ml-auto">{ts(event.timestamp)}</span>
      </div>

      {isExec && event.data.command && (
        <div className="mt-2 rounded bg-black/40 p-2 font-mono text-xs text-green-400">
          <span className="text-green-600 mr-2">$</span>
          {event.data.command}
        </div>
      )}

      {!isExec && event.data.args && Object.keys(event.data.args).length > 0 && (
        <div className="mt-2 space-y-1">
          {Object.entries(event.data.args).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="text-oc-accent font-mono shrink-0">{k}:</span>
              <ArgValue value={v} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolResultCard({ event }: { event: DashboardEvent }) {
  const isError = event.data.isError;
  return (
    <div
      className={`card border-l-2 ${isError ? "border-red-500/60" : "border-oc-surface-2/80"}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{isError ? "❌" : "✅"}</span>
        <span className="text-xs font-semibold text-oc-muted uppercase tracking-wide">
          Result
        </span>
        <span className="font-mono text-xs text-oc-muted">
          {event.data.toolName}
        </span>
        <span className="text-xs text-oc-muted/60 ml-auto">{ts(event.timestamp)}</span>
      </div>

      {event.data.result && (
        <Collapsible label={`${event.data.result.length} chars — click to expand`}>
          <pre className="whitespace-pre-wrap break-words">{event.data.result}</pre>
        </Collapsible>
      )}
    </div>
  );
}

function LifecycleCard({ event }: { event: DashboardEvent }) {
  const isStart = event.data.phase === "start";
  const isError = event.data.phase === "error";
  return (
    <div
      className={`card border-l-2 ${
        isError
          ? "border-red-500"
          : isStart
          ? "border-oc-accent"
          : "border-oc-muted/40"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{isError ? "🔴" : isStart ? "🟢" : "⚪"}</span>
        <span
          className={`text-xs font-bold uppercase tracking-widest ${
            isError ? "text-red-400" : isStart ? "text-oc-accent" : "text-oc-muted"
          }`}
        >
          {event.data.message ?? (isStart ? "Agent started" : "Agent finished")}
        </span>
        <span className="text-xs text-oc-muted/60 ml-auto">{ts(event.timestamp)}</span>
      </div>
    </div>
  );
}

function LlmTextCard({ event }: { event: DashboardEvent }) {
  return (
    <div className="px-4 py-1">
      <span className="text-sm text-oc-text/90">{event.data.delta}</span>
    </div>
  );
}

// ── Router ───────────────────────────────────────────────────────────────────

export function EventCard({ event }: { event: DashboardEvent }) {
  switch (event.type) {
    case "thinking":
      return <ThinkingCard event={event} />;
    case "tool_call":
    case "exec":
      return <ToolCard event={event} />;
    case "tool_result":
      return <ToolResultCard event={event} />;
    case "lifecycle":
      return <LifecycleCard event={event} />;
    case "llm_text":
      return <LlmTextCard event={event} />;
    default:
      return null;
  }
}
