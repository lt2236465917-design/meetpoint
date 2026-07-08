import { describe, expect, it } from "vitest";

describe("GET /api/cities/search", () => {
  it("returns matching local cities with public fields only", async () => {
    const { GET } = await import("@/app/api/cities/search/route");
    const response = await GET(
      new Request("http://localhost/api/cities/search?q=上"),
    );

    await expect(response.json()).resolves.toEqual({
      cities: [{ code: "shanghai", name: "上海", province: "上海" }],
    });
  });

  it("returns an empty list for a blank query", async () => {
    const { GET } = await import("@/app/api/cities/search/route");
    const response = await GET(
      new Request("http://localhost/api/cities/search?q="),
    );

    await expect(response.json()).resolves.toEqual({ cities: [] });
  });
});
