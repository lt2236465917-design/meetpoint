"use client";

import { useMemo, useState } from "react";
import { searchLocalCities } from "@/data/cities";

export function CityCombobox({
  value,
  onChange,
  label,
  placeholder = "选择城市",
}: {
  value: { code: string; name: string } | null;
  onChange: (city: { code: string; name: string } | null) => void;
  label?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const results = useMemo(() => searchLocalCities(query), [query]);
  const showResults = results.length > 0 && query.trim() !== value?.name;

  return (
    <div className="space-y-1.5">
      <input
        className="w-full rounded-lg border px-4 py-3"
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          if (value && nextQuery !== value.name) onChange(null);
        }}
      />
      {showResults && (
        <div className="max-h-48 w-full overflow-auto rounded-lg border bg-white shadow-sm">
          {results.map((city) => (
            <button
              type="button"
              className="block w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
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
