const DEFAULT_NEAR_END_SECONDS = 0.35;

export function shouldAdvanceScenicVideo(
  media: {
    currentTime: number;
    duration: number;
    ended: boolean;
  },
  nearEndSeconds = DEFAULT_NEAR_END_SECONDS,
) {
  if (media.ended) return true;
  if (!Number.isFinite(media.currentTime) || !Number.isFinite(media.duration)) {
    return false;
  }
  return media.duration > 0
    && media.duration - media.currentTime <= nearEndSeconds;
}

export function nextScenicVideoIndex(index: number, videoCount: number) {
  return videoCount > 0 ? (index + 1) % videoCount : 0;
}
