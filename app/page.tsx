"use client";

import { useState, useCallback } from "react";
import { useEventStream } from "./hooks/useEventStream";
import type { DashboardEventType } from "./hooks/useEventStream";
import { EventFeed } from "./components/EventFeed";
import { StatusBar } from "./components/StatusBar";
import { FilterBar } from "./components/FilterBar";

export default function Dashboard() {
  const { events, connected, model, clear } = useEventStream();
  const [activeFilters, setActiveFilters] = useState<Set<DashboardEventType>>(
    new Set()
  );

  const toggleFilter = useCallback((type: DashboardEventType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const showAll = useCallback(() => {
    setActiveFilters(new Set());
  }, []);

  return (
    <div className="min-h-screen bg-oc-bg text-oc-text flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-oc-bg/95 backdrop-blur border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🦞</span>
              <div>
                <h1 className="text-lg font-bold tracking-tight">
                  <span className="text-oc-accent">Open</span>
                  <span className="text-oc-text">Claw</span>
                  <span className="text-oc-muted font-normal text-base ml-2">
                    Dashboard
                  </span>
                </h1>
                <p className="text-xs text-oc-muted/60">
                  Live agent activity monitor
                </p>
              </div>
            </div>

            {/* Live indicator */}
            <div className="flex items-center gap-2">
              {connected && (
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                  LIVE
                </span>
              )}
            </div>
          </div>

          {/* Filter bar */}
          <FilterBar
            activeFilters={activeFilters}
            onToggle={toggleFilter}
            onShowAll={showAll}
          />
        </div>

        {/* Status bar */}
        <StatusBar
          connected={connected}
          model={model}
          eventCount={events.length}
          onClear={clear}
        />
      </header>

      {/* Event feed */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-4">
        <EventFeed events={events} activeFilters={activeFilters} />
      </main>
    </div>
  );
}
