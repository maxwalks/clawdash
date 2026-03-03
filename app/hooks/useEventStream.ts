"use client";

import { useEffect, useRef, useState, useCallback } from "react";

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
    text?: string;
    toolName?: string;
    toolCallId?: string;
    args?: Record<string, unknown>;
    result?: string;
    isError?: boolean;
    command?: string;
    output?: string;
    phase?: "start" | "end" | "error";
    message?: string;
    delta?: string;
    label?: string;
    model?: string;
  };
}

const RELAY_URL = "ws://localhost:3001";
const MAX_EVENTS = 300;

export function useEventStream() {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(RELAY_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryDelay.current = 1000;
    };

    ws.onmessage = (e) => {
      let event: DashboardEvent;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }

      // Handle status events specially
      if (event.type === "status") {
        if (event.data.label === "connected") setConnected(true);
        if (event.data.label === "disconnected") setConnected(false);
        if (event.data.label === "model" && event.data.model) {
          setModel(event.data.model);
        }
        return;
      }

      setEvents((prev) => {
        const next = [event, ...prev];
        return next.slice(0, MAX_EVENTS);
      });
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect with backoff
      retryDelay.current = Math.min(retryDelay.current * 1.5, 15000);
      retryRef.current = setTimeout(connect, retryDelay.current);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const clear = useCallback(() => setEvents([]), []);

  return { events, connected, model, clear };
}
