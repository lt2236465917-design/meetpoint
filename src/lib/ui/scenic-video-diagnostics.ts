export type ScenicVideoLike = Pick<
  HTMLVideoElement,
  | "currentSrc"
  | "readyState"
  | "networkState"
  | "paused"
  | "muted"
  | "currentTime"
  | "videoWidth"
  | "videoHeight"
  | "error"
>;

export type ScenicVideoSnapshot = {
  src: string;
  readyState: number;
  networkState: number;
  paused: boolean;
  muted: boolean;
  currentTime: number;
  dimensions: string;
  errorCode: number | null;
  errorMessage: string | null;
};

export function snapshotScenicVideo(
  video: ScenicVideoLike,
): ScenicVideoSnapshot {
  return {
    src: video.currentSrc,
    readyState: video.readyState,
    networkState: video.networkState,
    paused: video.paused,
    muted: video.muted,
    currentTime: Number(video.currentTime.toFixed(2)),
    dimensions: `${video.videoWidth}×${video.videoHeight}`,
    errorCode: video.error?.code ?? null,
    errorMessage: video.error?.message || null,
  };
}
