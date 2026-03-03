"use client";

import { useEffect, useRef } from "react";
import type { DashboardEvent, DashboardEventType } from "../hooks/useEventStream";
import { EventCard } from "./EventCard";

interface Props {
  events: DashboardEvent[];
  activeFilters: Set<DashboardEventType>;
}

export function EventFeed({ events, activeFilters }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top since newest events go to top
  // (no auto-scroll needed — they appear at the top)

  const filtered = events.filter(
    (e) =>
      activeFilters.size === 0 ||
      activeFilters.has(e.type) ||
      e.type === "lifecycle"
  );

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-oc-muted/40">
        <span className="text-4xl mb-3">🦞</span>
        <p className="text-sm">Waiting for OpenClaw activity...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-8">
      {filtered.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
