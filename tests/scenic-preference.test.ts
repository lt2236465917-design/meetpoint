import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCENIC_SCENE_STORAGE_KEY,
  readScenicSceneIndex,
  writeScenicSceneIndex,
} from "@/lib/ui/scenic-preference";

const storage = vi.hoisted(() => new Map<string, string>());

function installStorageStub() {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    clear: () => storage.clear(),
  });
  vi.stubGlobal("window", { localStorage: globalThis.localStorage });
}

describe("scenic preference", () => {
  beforeEach(() => {
    storage.clear();
    installStorageStub();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("defaults to 0 when unset", () => {
    expect(readScenicSceneIndex()).toBe(0);
  });

  it("round-trips a valid index", () => {
    writeScenicSceneIndex(2);
    expect(localStorage.getItem(SCENIC_SCENE_STORAGE_KEY)).toBe("2");
    expect(readScenicSceneIndex()).toBe(2);
  });

  it("clamps out-of-range values to 0 on read", () => {
    localStorage.setItem(SCENIC_SCENE_STORAGE_KEY, "99");
    expect(readScenicSceneIndex()).toBe(0);
  });
});
