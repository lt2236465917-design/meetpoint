"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  SCENIC_SCENES,
  type ScenicSceneId,
} from "@/lib/ui/scenic-videos";
import {
  readScenicPlaybackPosition,
  recordScenicPlaybackPosition,
} from "@/lib/ui/scenic-playback";

function subscribeReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerReducedMotionSnapshot() {
  return true;
}

export function ShellScenicBackdrop({ scene }: { scene: ScenicSceneId }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot,
  );
  const videoSrc = reducedMotion ? null : SCENIC_SCENES[scene].src;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    try {
      const playResult = video.play();
      if (playResult) {
        void playResult.catch(() => {
          // Autoplay can be blocked; muted loop + attribute still try on next paint.
        });
      }
    } catch {
      // ignore
    }

    return () => {
      recordScenicPlaybackPosition(scene, video.currentTime);
    };
  }, [scene, videoSrc]);

  function restorePlaybackPosition(video: HTMLVideoElement) {
    const saved = readScenicPlaybackPosition(scene);
    const target = saved ?? SCENIC_SCENES[scene].startAt;
    if (Number.isFinite(video.duration) && target < video.duration) {
      video.currentTime = target;
    }
  }

  return (
    <div className="shell-scenic" aria-hidden="true">
      <div className="shell-scenic-media">
        <div className="scenic-fallback absolute inset-0" />
        {videoSrc ? (
          <video
            ref={videoRef}
            className="pointer-events-none"
            src={videoSrc}
            muted
            autoPlay
            loop
            playsInline
            preload="auto"
            onLoadedMetadata={(event) => restorePlaybackPosition(event.currentTarget)}
            onTimeUpdate={(event) => {
              recordScenicPlaybackPosition(scene, event.currentTarget.currentTime);
            }}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
