"use client";

import type { DashboardEventType } from "../hooks/useEventStream";

const FILTERS: { type: DashboardEventType; label: string; icon: string }[] = [
  { type: "thinking", label: "Thinking", icon: "💭" },
  { type: "tool_call", label: "Tools", icon: "🔧" },
  { type: "exec", label: "Exec", icon: "💻" },
  { type: "tool_result", label: "Results", icon: "✅" },
  { type: "llm_text", label: "Text", icon: "📝" },
];

interface Props {
  activeFilters: Set<DashboardEventType>;
  onToggle: (type: DashboardEventType) => void;
  onShowAll: () => void;
}

export function FilterBar({ activeFilters, onToggle, onShowAll }: Props) {
  const showingAll = activeFilters.size === 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onShowAll}
        className={`filter-btn ${showingAll ? "filter-btn-active" : ""}`}
      >
        All
      </button>
      {FILTERS.map(({ type, label, icon }) => {
        const active = activeFilters.has(type);
        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            className={`filter-btn ${active ? "filter-btn-active" : ""}`}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
