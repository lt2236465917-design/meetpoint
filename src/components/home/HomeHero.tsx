"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  readScenicSceneIndex,
  writeScenicSceneIndex,
} from "@/lib/ui/scenic-preference";
import { SCENIC_VIDEOS as videos } from "@/lib/ui/scenic-videos";

const overlayImage =
  "https://soft-zoom-63098134.figma.site/_assets/v11/0b4a435b2df2747593c43d7a1c9b4578f7d8d90c.png";

const HAVE_METADATA = 1;
const HAVE_FUTURE_DATA = 3;
const NETWORK_EMPTY = 0;
const SCENE_READY_TIMEOUT_MS = 4500;

function setSceneStart(video: HTMLVideoElement, startAt: number) {
  const canUseSceneStart =
    Number.isFinite(video.duration) && video.duration > startAt + 1;
  video.currentTime = canUseSceneStart ? startAt : 0;
}

function seekToSceneStart(video: HTMLVideoElement, startAt: number) {
  if (video.readyState < HAVE_METADATA || !Number.isFinite(video.duration)) {
    video.addEventListener(
      "loadedmetadata",
      () => {
        try {
          setSceneStart(video, startAt);
        } catch {
          // ignore seek failures in unsupported environments
        }
      },
      { once: true },
    );

    if (video.networkState === NETWORK_EMPTY) {
      video.load();
    }
    return;
  }

  try {
    setSceneStart(video, startAt);
  } catch {
    video.addEventListener(
      "loadedmetadata",
      () => {
        try {
          setSceneStart(video, startAt);
        } catch {
          // ignore
        }
      },
      { once: true },
    );
  }
}

function waitForSceneReady(video: HTMLVideoElement, startAt: number) {
  return new Promise<boolean>((resolve) => {
    let isSettled = false;
    const timer: { id?: number } = {};

    const finish = (isReady: boolean) => {
      if (isSettled) return;
      isSettled = true;
      if (timer.id !== undefined) window.clearTimeout(timer.id);
      video.removeEventListener("loadedmetadata", handleMetadata);
      video.removeEventListener("loadeddata", handleReadiness);
      video.removeEventListener("canplay", handleReadiness);
      video.removeEventListener("seeked", handleReadiness);
      video.removeEventListener("error", handleError);
      resolve(isReady);
    };

    const handleReadiness = () => {
      if (video.readyState >= HAVE_FUTURE_DATA) finish(true);
    };

    const handleMetadata = () => {
      seekToSceneStart(video, startAt);
      handleReadiness();
    };

    const handleError = () => finish(false);

    video.addEventListener("loadedmetadata", handleMetadata);
    video.addEventListener("loadeddata", handleReadiness);
    video.addEventListener("canplay", handleReadiness);
    video.addEventListener("seeked", handleReadiness);
    video.addEventListener("error", handleError);

    seekToSceneStart(video, startAt);
    handleReadiness();

    if (isSettled) return;

    if (video.networkState === NETWORK_EMPTY) {
      video.load();
    }

    timer.id = window.setTimeout(() => finish(false), SCENE_READY_TIMEOUT_MS);
  });
}

export function HomeHero() {
  const [activeVideo, setActiveVideo] = useState(readScenicSceneIndex);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [firstSceneReady, setFirstSceneReady] = useState(false);
  const hasSceneChanged = useRef(false);
  const switchLockRef = useRef(false);
  const transitionTimeoutRef = useRef<number | undefined>(undefined);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current !== undefined) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video || index === 0) return;
      seekToSceneStart(video, videos[index].startAt);
    });
  }, []);

  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index !== activeVideo) {
        video.pause();
        return;
      }

      const shouldUseOpeningStart = index === 0 && !hasSceneChanged.current;
      seekToSceneStart(
        video,
        shouldUseOpeningStart ? 0 : videos[index].startAt,
      );
      try {
        const playResult = video.play();
        if (playResult) {
          void playResult
            .then(() => {
              if (index === 0) setFirstSceneReady(true);
            })
            .catch(() => {
              if (index === 0) setFirstSceneReady(true);
            });
        } else if (index === 0) {
          setFirstSceneReady(true);
        }
      } catch {
        if (index === 0) setFirstSceneReady(true);
      }
    });
  }, [activeVideo]);

  const releaseSwitchLockAfterFade = () => {
    if (transitionTimeoutRef.current !== undefined) {
      window.clearTimeout(transitionTimeoutRef.current);
    }
    transitionTimeoutRef.current = window.setTimeout(() => {
      switchLockRef.current = false;
      setIsTransitioning(false);
    }, 1000);
  };

  const activateVideo = (index: number) => {
    setActiveVideo(index);
    writeScenicSceneIndex(index);
    setIsTransitioning(true);
    releaseSwitchLockAfterFade();
  };

  const switchVideo = (index: number) => {
    if (index === activeVideo || isTransitioning || switchLockRef.current) {
      return;
    }

    switchLockRef.current = true;
    hasSceneChanged.current = true;
    setIsTransitioning(true);

    const video = videoRefs.current[index];
    if (!video) {
      activateVideo(index);
      return;
    }

    const startAt =
      index === 0 && !hasSceneChanged.current ? 0 : videos[index].startAt;
    seekToSceneStart(video, startAt);

    if (video.readyState >= HAVE_FUTURE_DATA) {
      activateVideo(index);
      return;
    }

    void waitForSceneReady(video, startAt).then((isReady) => {
      if (isReady) {
        activateVideo(index);
        return;
      }
      switchLockRef.current = false;
      setIsTransitioning(false);
    });
  };

  const switchToNextVideo = (index: number) => {
    switchVideo((index + 1) % videos.length);
  };

  return (
    <section className="relative h-full min-h-[100%] w-full overflow-hidden bg-black">
      <div className="absolute inset-0 z-0">
        <div className="scenery-track absolute inset-0" aria-hidden="true">
          <div className="scenic-fallback absolute inset-0" />
          {videos.map((video, index) => (
            <video
              key={video.label}
              ref={(element) => {
                videoRefs.current[index] = element;
              }}
              className={`absolute inset-0 z-10 h-full w-full object-cover transition-opacity duration-[1400ms] ease-in-out ${
                activeVideo === index && firstSceneReady
                  ? "opacity-100"
                  : "opacity-0"
              }`}
              src={video.src}
              preload="auto"
              autoPlay={activeVideo === index}
              muted
              playsInline
              onPlaying={() => {
                if (index === 0) setFirstSceneReady(true);
              }}
              onEnded={() => switchToNextVideo(index)}
              aria-label={`${video.label}背景`}
            />
          ))}
        </div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- external train-frame overlay from approved hero preview */}
      <img
        className="pointer-events-none absolute inset-0 z-10 h-full w-full scale-[1.03] object-cover opacity-95 train-bob"
        src={overlayImage}
        alt=""
        aria-hidden="true"
      />

      <div className="relative z-20 flex h-full flex-col px-5 py-5 sm:px-8">
        <header className="flex shrink-0 items-center justify-between gap-4">
          <p className="font-display readable-title text-xl text-white sm:text-2xl">
            跨城见面
          </p>
          <Link
            href="/records"
            className="readable-body font-sans-sc rounded-full border border-white/25 bg-black/25 px-3.5 py-1.5 text-sm text-white/95 backdrop-blur-md transition-opacity hover:opacity-90"
          >
            最近记录
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center py-6 text-center">
          <div className="flex w-full max-w-sm flex-col items-center text-white">
            <div className="hero-chip readable-body font-sans-sc mb-6 rounded-full px-4 py-2 text-xs text-white/95">
              朋友各在一座城，也能约上同一天
            </div>

            <h1 className="font-display readable-title text-[1.75rem] leading-[1.3] sm:text-[2rem]">
              散在几座城的朋友，
              <br />
              这次在哪儿见？
            </h1>

            <p className="readable-body font-sans-sc mt-5 max-w-xs text-sm leading-relaxed text-white">
              每个人填一座出发城市，我们查遍真实机票和火车票，为朋友选出一座见面城市。
            </p>

            <div className="mt-7 flex w-full flex-col items-center gap-3">
              <Link
                href="/create"
                className="hero-cta font-sans-sc w-[min(100%,18rem)] rounded-full px-8 py-3.5 text-center text-base font-semibold tracking-wide text-white transition-transform hover:scale-[1.02] sm:w-[19.5rem] sm:text-lg"
              >
                发起见面计划
              </Link>
              <p className="readable-body font-sans-sc max-w-sm text-center text-xs text-white/85">
                建好计划把链接丢进群里，人齐了就知道该去哪儿见
              </p>
            </div>

            <div
              className="font-sans-sc mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
              aria-label="切换窗外风景"
            >
              {videos.map((video, index) => {
                const isActive = activeVideo === index;
                return (
                  <button
                    key={video.label}
                    type="button"
                    className={`readable-body border-b pb-1.5 text-sm text-white transition-all duration-300 ${
                      isActive
                        ? "border-white opacity-100"
                        : "border-transparent opacity-55 hover:opacity-85"
                    }`}
                    onClick={() => switchVideo(index)}
                    aria-pressed={isActive}
                  >
                    {video.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
