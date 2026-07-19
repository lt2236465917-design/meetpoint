import type { ScenicSceneId } from "@/lib/ui/scenic-videos";

const playbackPositions = new Map<ScenicSceneId, number>();

export function recordScenicPlaybackPosition(
  scene: ScenicSceneId,
  currentTime: number,
) {
  if (!Number.isFinite(currentTime) || currentTime < 0) return;
  playbackPositions.set(scene, currentTime);
}

export function readScenicPlaybackPosition(scene: ScenicSceneId) {
  return playbackPositions.get(scene) ?? null;
}
