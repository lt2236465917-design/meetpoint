import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCENIC_SCENE_STORAGE_KEY,
  SCENIC_SCENE_UPDATED_EVENT,
  readScenicSceneIndex,
  subscribeScenicSceneIndex,
  writeScenicSceneIndex,
} from "@/lib/ui/scenic-preference";

const storage = vi.hoisted(() => new Map<string, string>());

function installStorageStub() {
  const localStorageStub = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    clear: () => storage.clear(),
  };
  vi.stubGlobal("localStorage", localStorageStub);
  const listeners = new Map<string, Set<EventListener>>();
  vi.stubGlobal("window", {
    localStorage: localStorageStub,
    addEventListener: (type: string, listener: EventListener) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
  });
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

  it("notifies same-tab subscribers when the scene is written", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeScenicSceneIndex(onChange);
    writeScenicSceneIndex(1);
    expect(onChange).toHaveBeenCalled();
    expect(SCENIC_SCENE_UPDATED_EVENT).toBe("meetpoint:scenic-scene-updated");
    unsubscribe();
  });
});
