"use client";

import { useEffect, useState } from "react";

import {
  snapshotScenicVideo,
  type ScenicVideoSnapshot,
} from "@/lib/ui/scenic-video-diagnostics";

const MEDIA_EVENTS = [
  "loadstart",
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "playing",
  "waiting",
  "stalled",
  "suspend",
  "abort",
  "error",
] as const;

type ConnectionInfo = {
  effectiveType?: string;
  saveData?: boolean;
  downlink?: number;
};

type DiagnosticMeta = {
  userAgent: string;
  secureContext: boolean;
  reducedMotion: boolean;
  canPlayH264: string;
  connection: string;
};

function connectionSummary(): string {
  const connection = (navigator as Navigator & { connection?: ConnectionInfo })
    .connection;
  if (!connection) return "unknown";
  return [
    connection.effectiveType ?? "unknown",
    `saveData=${connection.saveData ?? false}`,
    `downlink=${connection.downlink ?? "unknown"}`,
  ].join(" ");
}

function readDiagnosticMeta(): DiagnosticMeta {
  const probe = document.createElement("video");
  return {
    userAgent: navigator.userAgent,
    secureContext: window.isSecureContext,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    canPlayH264: probe.canPlayType('video/mp4; codecs="avc1.4D401F"') || "no",
    connection: connectionSummary(),
  };
}

export function ScenicVideoDiagnostics() {
  const [enabled, setEnabled] = useState(false);
  const [videos, setVideos] = useState<ScenicVideoSnapshot[]>([]);
  const [lastEvent, setLastEvent] = useState("none");
  const [playResult, setPlayResult] = useState("not attempted");
  const meta = enabled ? readDiagnosticMeta() : null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEnabled(
        new URLSearchParams(window.location.search).get("videoDebug") === "1",
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const collect = () => {
      setVideos(
        Array.from(document.querySelectorAll("video")).map(snapshotScenicVideo),
      );
    };
    const handleMediaEvent = (event: Event) => {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement)) return;
      setLastEvent(`${event.type}:${video.currentSrc.split("/").at(-1) ?? "unknown"}`);
      collect();
    };
    for (const eventName of MEDIA_EVENTS) {
      document.addEventListener(eventName, handleMediaEvent, true);
    }
    const firstCollection = window.requestAnimationFrame(collect);
    const timer = window.setInterval(collect, 1_000);
    return () => {
      window.cancelAnimationFrame(firstCollection);
      window.clearInterval(timer);
      for (const eventName of MEDIA_EVENTS) {
        document.removeEventListener(eventName, handleMediaEvent, true);
      }
    };
  }, [enabled]);

  async function tryPlayback() {
    const video = document.querySelector<HTMLVideoElement>("video[autoplay]")
      ?? document.querySelector<HTMLVideoElement>("video");
    if (!video) {
      setPlayResult("failed: no video element");
      return;
    }
    try {
      video.muted = true;
      await video.play();
      setPlayResult("success");
    } catch (error) {
      setPlayResult(
        `failed: ${error instanceof Error ? `${error.name} ${error.message}` : String(error)}`,
      );
    }
  }

  if (!enabled) return null;

  return (
    <aside className="fixed inset-x-2 bottom-2 z-[9999] max-h-[58svh] overflow-auto rounded-xl border border-white/40 bg-black/95 p-3 font-mono text-[11px] leading-4 text-white shadow-2xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <strong>背景视频诊断</strong>
        <button
          className="rounded border border-white/50 px-2 py-1"
          onClick={() => void tryPlayback()}
          type="button"
        >
          手动播放
        </button>
      </div>
      <div>videoCount={videos.length}</div>
      <div>secureContext={String(meta?.secureContext)}</div>
      <div>reducedMotion={String(meta?.reducedMotion)}</div>
      <div>canPlayH264={meta?.canPlayH264}</div>
      <div>connection={meta?.connection}</div>
      <div>lastEvent={lastEvent}</div>
      <div>playResult={playResult}</div>
      <div className="mt-1 break-all">UA={meta?.userAgent}</div>
      {videos.map((video, index) => (
        <div className="mt-2 border-t border-white/30 pt-2" key={`${index}-${video.src}`}>
          <div>video[{index}]={video.src.split("/").at(-1) || "no-src"}</div>
          <div>
            ready={video.readyState} network={video.networkState} paused={String(video.paused)} muted={String(video.muted)}
          </div>
          <div>time={video.currentTime} size={video.dimensions}</div>
          <div>error={video.errorCode ?? "none"} {video.errorMessage ?? ""}</div>
        </div>
      ))}
    </aside>
  );
}
