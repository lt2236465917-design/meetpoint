"use client";

import { useSyncExternalStore } from "react";
import { readScenicSceneIndex } from "@/lib/ui/scenic-preference";
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

function subscribeScenicScene() {
  return () => {};
}

function getServerScenicSceneSnapshot() {
  return 0;
}

export function ShellScenicBackdrop() {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot,
  );
  const sceneIndex = useSyncExternalStore(
    subscribeScenicScene,
    readScenicSceneIndex,
    getServerScenicSceneSnapshot,
  );

  const videoSrc = reducedMotion ? null : SCENIC_VIDEOS[sceneIndex].src;

  return (
    <div className="shell-scenic" aria-hidden="true">
      <div className="shell-scenic-media">
        <div className="scenic-fallback absolute inset-0" />
        {videoSrc ? (
          <video
            src={videoSrc}
            muted
            autoPlay
            loop
            playsInline
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
