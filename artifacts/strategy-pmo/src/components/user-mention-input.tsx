import { useState, useRef, useEffect } from "react";

interface UserResult {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
}

interface UserMentionInputProps {
  value: string;
  onChange: (name: string, userId?: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function UserMentionInput({ value, onChange, placeholder = "Type @ to search users…", className = "", disabled }: UserMentionInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Search users when query changes
  useEffect(() => {
    if (!query || query.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    setLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/spmo/users/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.users ?? []);
          setShowDropdown(true);
          setSelectedIdx(0);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectUser = (user: UserResult) => {
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || user.id;
    onChange(name, user.id);
    setQuery("");
    setShowDropdown(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    // Detect @ trigger
    const atIdx = val.lastIndexOf("@");
    if (atIdx >= 0) {
      const afterAt = val.slice(atIdx + 1);
      if (!afterAt.includes(" ") || afterAt.length < 20) {
        setQuery(afterAt);
      } else {
        setQuery("");
        setShowDropdown(false);
      }
    } else if (val.length >= 2) {
      // Also search if they just type a name without @
      setQuery(val);
    } else {
      setQuery("");
      setShowDropdown(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && showDropdown) {
      e.preventDefault();
      selectUser(results[selectedIdx]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const getUserDisplayName = (u: UserResult) => {
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
    return name || u.email || u.id;
  };

  const baseInputClass = "w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (value.length >= 2) setQuery(value); }}
        placeholder={placeholder}
        disabled={disabled}
        className={className || baseInputClass}
      />
      {showDropdown && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {results.map((user, idx) => (
            <button
              key={user.id}
              type="button"
              onClick={() => selectUser(user)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                idx === selectedIdx ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {(user.firstName?.[0] ?? user.email?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{getUserDisplayName(user)}</div>
                {user.email && <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>}
              </div>
              {user.role && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">
                  {user.role}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {showDropdown && loading && results.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-sm text-muted-foreground">
          Searching…
        </div>
      )}
      {showDropdown && !loading && results.length === 0 && query.length >= 1 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-sm text-muted-foreground">
          No users found
        </div>
      )}
    </div>
  );
}
