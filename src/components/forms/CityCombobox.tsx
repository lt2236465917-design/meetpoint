"use client";

import { useEffect, useState } from "react";

type CityOption = { code: string; name: string; province: string };

export function CityCombobox({
  value,
  onChange,
  label,
  placeholder = "输入城市名，如 北京 / 湛江",
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
  const [fetchSettled, setFetchSettled] = useState(false);
  const showResults = results.length > 0 && query.trim() !== value?.name;
  const searchedEmpty =
    query.trim() !== "" && fetchSettled && results.length === 0;
  const isAtmosphere = tone === "atmosphere";

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setResults([]);
      setFetchSettled(false);
      return;
    }

    const controller = new AbortController();
    setFetchSettled(false);
    void (async () => {
      try {
        const response = await fetch(
          `/api/cities/search?q=${encodeURIComponent(normalized)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          if (!controller.signal.aborted) setResults([]);
          return;
        }
        const json = (await response.json()) as { cities?: CityOption[] };
        if (!Array.isArray(json.cities)) {
          if (!controller.signal.aborted) setResults([]);
          return;
        }
        if (!controller.signal.aborted) setResults(json.cities);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setFetchSettled(true);
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
          if (!nextQuery.trim()) {
            setResults([]);
            setFetchSettled(false);
          }
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
      {searchedEmpty && (
        <p
          className={
            isAtmosphere
              ? "text-sm text-[var(--atmosphere-muted)]"
              : "text-sm text-gray-500"
          }
        >
          没找到这个市，试试完整市名，如「湛江」
        </p>
      )}
    </div>
  );
}
