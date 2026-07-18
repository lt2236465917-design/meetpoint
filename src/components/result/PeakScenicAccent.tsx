"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { PEAK_SCENIC_VIDEO } from "@/lib/ui/scenic-videos";

const HAVE_METADATA = 1;

function seekToStart(video: HTMLVideoElement, startAt: number) {
  if (video.readyState < HAVE_METADATA || !Number.isFinite(video.duration)) {
    return;
  }
  const canUseSceneStart =
    Number.isFinite(video.duration) && video.duration > startAt + 1;
  try {
    video.currentTime = canUseSceneStart ? startAt : 0;
  } catch {
    // ignore seek failures in unsupported environments
  }
}

export function PeakScenicAccent({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) {
      video.pause();
      return;
    }

    const handleMetadata = () => {
      seekToStart(video, PEAK_SCENIC_VIDEO.startAt);
    };

    video.addEventListener("loadedmetadata", handleMetadata);
    seekToStart(video, PEAK_SCENIC_VIDEO.startAt);

    try {
      void video.play().catch(() => {
        // autoplay may be blocked; muted loop still paints first frame
      });
    } catch {
      // ignore
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleMetadata);
      video.pause();
    };
  }, []);

  return (
    <div className={`peak-scenic relative overflow-hidden ${className}`.trim()}>
      <div className="peak-scenic-media pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="scenic-fallback absolute inset-0" />
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={PEAK_SCENIC_VIDEO.src}
          preload="metadata"
          muted
          playsInline
          loop
          aria-label={`${label}窗外风景`}
        />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
