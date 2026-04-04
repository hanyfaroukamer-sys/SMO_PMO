import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, Briefcase, Target, ShieldAlert, Flag, FileText, X } from "lucide-react";

interface SearchResult {
  type: string;
  id: number;
  title: string;
  subtitle: string;
  link: string;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  project: Briefcase,
  milestone: Target,
  kpi: FileText,
  risk: ShieldAlert,
  initiative: Flag,
};

const TYPE_LABELS: Record<string, string> = {
  project: "Project",
  milestone: "Milestone",
  kpi: "KPI",
  risk: "Risk",
  initiative: "Initiative",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [, navigate] = useLocation();

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
    }
  }, [open]);

  // Search with debounce
  const search = useCallback((q: string) => {
    clearTimeout(debounceRef.current);
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/spmo/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
          setSelectedIdx(0);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }, 200);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    search(e.target.value);
  };

  const selectResult = (result: SearchResult) => {
    setOpen(false);
    navigate(result.link);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      selectResult(results[selectedIdx]);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative mx-auto mt-[15vh] w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl border border-border bg-popover shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <Search className="w-5 h-5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Search projects, milestones, KPIs, risks…"
              className="flex-1 py-4 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground/50"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] text-muted-foreground font-mono">
              ESC
            </kbd>
            <button onClick={() => setOpen(false)} className="sm:hidden p-1 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto">
            {loading && results.length === 0 && (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">Searching…</div>
            )}

            {!loading && query.length >= 2 && results.length === 0 && (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">No results found for "{query}"</div>
            )}

            {query.length < 2 && (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                Type at least 2 characters to search
              </div>
            )}

            {results.map((result, idx) => {
              const Icon = TYPE_ICONS[result.type] ?? FileText;
              return (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => selectResult(result)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                    idx === selectedIdx ? "bg-accent" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{result.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{result.subtitle}</div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">
                    {TYPE_LABELS[result.type] ?? result.type}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><kbd className="px-1 rounded border border-border bg-background font-mono">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1 rounded border border-border bg-background font-mono">↵</kbd> Open</span>
            <span className="flex items-center gap-1"><kbd className="px-1 rounded border border-border bg-background font-mono">esc</kbd> Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small trigger button for the sidebar/header */
export function SearchTrigger({ collapsed }: { collapsed?: boolean }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
      className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors text-[13px]"
      title="Search (⌘K)"
    >
      <Search className="w-4 h-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[10px] px-1 rounded border border-sidebar-border/40 bg-sidebar/50 font-mono">⌘K</kbd>
        </>
      )}
    </button>
  );
}
