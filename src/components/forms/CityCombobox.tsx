"use client";

import { useMemo, useState } from "react";
import { searchLocalCities } from "@/data/cities";

export function CityCombobox({
  value,
  onChange,
}: {
  value: { code: string; name: string } | null;
  onChange: (city: { code: string; name: string } | null) => void;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const results = useMemo(() => searchLocalCities(query), [query]);

  return (
    <div className="relative">
      <input
        className="w-full rounded-lg border px-4 py-3"
        placeholder="出发城市"
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          if (value && nextQuery !== value.name) onChange(null);
        }}
      />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white shadow-lg">
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
