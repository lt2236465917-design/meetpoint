import { SCENIC_VIDEOS } from "@/lib/ui/scenic-videos";

export const SCENIC_SCENE_STORAGE_KEY = "meetpoint:scenic-scene";
export const SCENIC_SCENE_UPDATED_EVENT = "meetpoint:scenic-scene-updated";

function clampIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= SCENIC_VIDEOS.length) {
    return 0;
  }
  return index;
}

export function readScenicSceneIndex(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(SCENIC_SCENE_STORAGE_KEY);
  if (raw == null) return 0;
  return clampIndex(Number.parseInt(raw, 10));
}

export function writeScenicSceneIndex(index: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SCENIC_SCENE_STORAGE_KEY,
    String(clampIndex(index)),
  );
  window.dispatchEvent(new Event(SCENIC_SCENE_UPDATED_EVENT));
}

/** Subscribe for useSyncExternalStore — same-tab writes + cross-tab storage. */
export function subscribeScenicSceneIndex(onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SCENIC_SCENE_STORAGE_KEY || event.key == null) {
      onStoreChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SCENIC_SCENE_UPDATED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SCENIC_SCENE_UPDATED_EVENT, onStoreChange);
  };
}
