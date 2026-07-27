export function resolveScenicAssetUrl(baseUrl: string, assetPath: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  const normalizedAssetPath = assetPath.startsWith("/")
    ? assetPath
    : `/${assetPath}`;
  return `${normalizedBaseUrl}${normalizedAssetPath}`;
}

const scenicBaseUrl = process.env.NEXT_PUBLIC_SCENIC_BASE_URL ?? "";

export const SCENIC_VIDEOS = [
  {
    label: "金色黄昏",
    src: resolveScenicAssetUrl(scenicBaseUrl, "/scenic/golden-hour.mp4"),
    mobileSrc: resolveScenicAssetUrl(
      scenicBaseUrl,
      "/scenic/golden-hour-mobile.mp4",
    ),
    startAt: 2.8,
  },
  {
    label: "静水",
    src: resolveScenicAssetUrl(scenicBaseUrl, "/scenic/still-water.mp4"),
    mobileSrc: resolveScenicAssetUrl(
      scenicBaseUrl,
      "/scenic/still-water-mobile.mp4",
    ),
    startAt: 2.8,
  },
  {
    label: "密林",
    src: resolveScenicAssetUrl(scenicBaseUrl, "/scenic/forest.mp4"),
    mobileSrc: resolveScenicAssetUrl(
      scenicBaseUrl,
      "/scenic/forest-mobile.mp4",
    ),
    startAt: 2.8,
  },
  {
    label: "破晓",
    src: resolveScenicAssetUrl(scenicBaseUrl, "/scenic/dawn.mp4"),
    mobileSrc: resolveScenicAssetUrl(
      scenicBaseUrl,
      "/scenic/dawn-mobile.mp4",
    ),
    startAt: 5.2,
  },
] as const;

export const MOBILE_INLINE_VIDEO_ATTRIBUTES = {
  "webkit-playsinline": "true",
  "x5-playsinline": "true",
  "x5-video-player-type": "h5-page",
  "x5-video-player-fullscreen": "false",
  "x5-video-orientation": "portrait",
} as const;

export const SCENIC_SCENES = {
  goldenHour: SCENIC_VIDEOS[0],
  stillWater: SCENIC_VIDEOS[1],
  forest: SCENIC_VIDEOS[2],
  dawn: SCENIC_VIDEOS[3],
} as const;

export type ScenicSceneId = keyof typeof SCENIC_SCENES;
