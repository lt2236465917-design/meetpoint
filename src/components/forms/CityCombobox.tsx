"use client";

import { useEffect, useState } from "react";

type CityOption = { code: string; name: string; province: string };

export function CityCombobox({
  value,
  onChange,
  label,
  placeholder = "选择城市",
  tone = "atmosphere",
}: {
  value: { code: string; name: string } | null;
  onChange: (city: { code: string; name: string } | null) => void;
  label?: string;
  placeholder?: string;
  tone?: "default" | "atmosphere";
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [results, setResults] = useState<CityOption[]>([]);
  const showResults = results.length > 0 && query.trim() !== value?.name;
  const isAtmosphere = tone === "atmosphere";

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/cities/search?q=${encodeURIComponent(normalized)}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const json = (await response.json()) as { cities?: CityOption[] };
        if (!Array.isArray(json.cities)) return;
        setResults(json.cities);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      }
    })();

    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    const normalized = query.trim();
    const exactCity = results.find((city) => city.name === normalized);
    if (!exactCity || value?.code === exactCity.code) return;
    onChange({ code: exactCity.code, name: exactCity.name });
  }, [onChange, query, results, value?.code]);

  return (
    <div className="space-y-1.5">
      <input
        className={
          isAtmosphere
            ? "atmosphere-field w-full rounded-lg px-4 py-3"
            : "w-full rounded-lg border px-4 py-3"
        }
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          if (!nextQuery.trim()) setResults([]);
          if (value && nextQuery !== value.name) onChange(null);
        }}
      />
      {showResults && (
        <div
          className={
            isAtmosphere
              ? "atmosphere-panel max-h-48 w-full overflow-auto rounded-lg"
              : "max-h-48 w-full overflow-auto rounded-lg border bg-white shadow-sm"
          }
        >
          {results.map((city) => (
            <button
              type="button"
              className={
                isAtmosphere
                  ? "block w-full px-4 py-3 text-left text-sm text-[var(--atmosphere-ink)] hover:bg-white/10"
                  : "block w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
              }
              key={city.code}
              onClick={() => {
                setQuery(city.name);
                onChange({ code: city.code, name: city.name });
              }}
            >
              {city.name} · {city.province}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
