import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { searchAddressSuggestions, type AddressSuggestion } from "../../lib/routeDistance";
import { inputClass } from "./Field";

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const query = value.trim();
    requestId.current += 1;
    const currentRequest = requestId.current;
    if (query.length < 2) return;

    const timeout = window.setTimeout(() => {
      searchAddressSuggestions(query).then((next) => {
        if (currentRequest !== requestId.current) return;
        setSuggestions(next);
        setOpen(next.length > 0);
        setLoading(false);
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [value]);

  function selectSuggestion(suggestion: AddressSuggestion) {
    onChange(suggestion.address);
    onSelect?.(suggestion);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        required={required}
        className={inputClass}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          if (nextValue.trim().length < 2) {
            setSuggestions([]);
            setOpen(false);
            setLoading(false);
          } else {
            setOpen(true);
            setLoading(true);
          }
        }}
        onFocus={() => setOpen(suggestions.length > 0)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {loading && <div className="pointer-events-none absolute right-3 top-2.5 text-xs text-slate-400">Söker...</div>}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-white py-1 shadow-lg">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-orange-50"
            >
              <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
              <span>
                <span className="block font-medium text-slate-700">{suggestion.address}</span>
                {suggestion.place && <span className="block text-xs text-slate-500">{suggestion.place}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
