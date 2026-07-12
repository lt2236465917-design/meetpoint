import { describe, expect, it } from "vitest";

import { TtlCache } from "../src/cache.js";

describe("TtlCache", () => {
  it("expires values after the default 300000 ms TTL", () => {
    const cache = new TtlCache<string>();
    cache.set("route", "option", 1_000);

    expect(cache.get("route", 300_999)).toBe("option");
    expect(cache.get("route", 301_000)).toBeUndefined();
  });

  it("evicts the oldest entry when the default 1000-entry limit is exceeded", () => {
    const cache = new TtlCache<number>();
    for (let index = 0; index <= 1_000; index += 1) cache.set(`key-${index}`, index, 0);

    expect(cache.get("key-0", 1)).toBeUndefined();
    expect(cache.get("key-1", 1)).toBe(1);
    expect(cache.get("key-1000", 1)).toBe(1_000);
  });
});
