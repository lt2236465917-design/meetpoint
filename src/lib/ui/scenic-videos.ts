export const SCENIC_VIDEOS = [
  {
    label: "金色黄昏",
    src: "/scenic/golden-hour.mp4",
    mobileSrc: "/scenic/golden-hour-mobile.mp4",
    startAt: 2.8,
  },
  {
    label: "静水",
    src: "/scenic/still-water.mp4",
    mobileSrc: "/scenic/still-water-mobile.mp4",
    startAt: 2.8,
  },
  {
    label: "密林",
    src: "/scenic/forest.mp4",
    mobileSrc: "/scenic/forest-mobile.mp4",
    startAt: 2.8,
  },
  {
    label: "破晓",
    src: "/scenic/dawn.mp4",
    mobileSrc: "/scenic/dawn-mobile.mp4",
    startAt: 5.2,
  },
] as const;

export const MOBILE_INLINE_VIDEO_ATTRIBUTES = {
  "webkit-playsinline": "true",
  "x5-video-player-type": "h5-page",
  "x5-video-player-fullscreen": "false",
} as const;

export const SCENIC_SCENES = {
  goldenHour: SCENIC_VIDEOS[0],
  stillWater: SCENIC_VIDEOS[1],
  forest: SCENIC_VIDEOS[2],
  dawn: SCENIC_VIDEOS[3],
} as const;

export type ScenicSceneId = keyof typeof SCENIC_SCENES;
