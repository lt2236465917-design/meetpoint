"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  readScenicSceneIndex,
  subscribeScenicSceneIndex,
} from "@/lib/ui/scenic-preference";
import { SCENIC_VIDEOS } from "@/lib/ui/scenic-videos";

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

function getServerScenicSceneSnapshot() {
  return 0;
}

export function ShellScenicBackdrop() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot,
  );
  const sceneIndex = useSyncExternalStore(
    subscribeScenicSceneIndex,
    readScenicSceneIndex,
    getServerScenicSceneSnapshot,
  );

  const videoSrc = reducedMotion ? null : SCENIC_VIDEOS[sceneIndex].src;

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
  }, [videoSrc]);

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
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
