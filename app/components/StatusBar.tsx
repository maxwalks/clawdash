"use client";

interface Props {
  connected: boolean;
  model: string | null;
  eventCount: number;
  onClear: () => void;
}

export function StatusBar({ connected, model, eventCount, onClear }: Props) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-oc-surface border-b border-white/5 text-xs text-oc-muted">
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${
            connected ? "bg-green-500 animate-pulse" : "bg-red-500"
          }`}
        />
        <span className={connected ? "text-green-400" : "text-red-400"}>
          {connected ? "Gateway connected" : "Disconnected — reconnecting..."}
        </span>
      </div>

      {/* Model */}
      {model && (
        <>
          <span className="text-oc-muted/30">|</span>
          <span className="font-mono text-oc-muted/70">{model}</span>
        </>
      )}

      <div className="ml-auto flex items-center gap-3">
        {/* Event count */}
        <span className="text-oc-muted/50">
          {eventCount} event{eventCount !== 1 ? "s" : ""}
        </span>

        {/* Clear */}
        {eventCount > 0 && (
          <button
            onClick={onClear}
            className="text-oc-muted/50 hover:text-oc-text transition-colors px-2 py-0.5 rounded border border-white/10 hover:border-white/20"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
