type PlayableMedia = {
  play: () => Promise<void> | void;
};

type ScenicPlaybackOptions = {
  target?: EventTarget;
  onStarted?: () => void;
};

const RECOVERY_EVENTS = ["pointerdown", "touchstart"] as const;
const RECOVERY_LISTENER_OPTIONS = {
  capture: true,
  passive: true,
} as const;

export function startScenicPlayback(
  video: PlayableMedia,
  options: ScenicPlaybackOptions = {},
): () => void {
  const target = options.target ?? window;
  let armed = false;
  let disposed = false;

  const removeRecoveryListeners = () => {
    if (!armed) return;
    for (const eventName of RECOVERY_EVENTS) {
      target.removeEventListener(
        eventName,
        resumePlayback,
        RECOVERY_LISTENER_OPTIONS,
      );
    }
    armed = false;
  };

  const armRecoveryListeners = () => {
    if (disposed || armed) return;
    for (const eventName of RECOVERY_EVENTS) {
      target.addEventListener(
        eventName,
        resumePlayback,
        RECOVERY_LISTENER_OPTIONS,
      );
    }
    armed = true;
  };

  const playbackStarted = () => {
    if (disposed) return;
    removeRecoveryListeners();
    options.onStarted?.();
  };

  function attemptPlayback() {
    try {
      const playResult = video.play();
      if (playResult) {
        void playResult.then(playbackStarted, armRecoveryListeners);
      } else {
        playbackStarted();
      }
    } catch {
      armRecoveryListeners();
    }
  }

  function resumePlayback() {
    attemptPlayback();
  }

  attemptPlayback();

  return () => {
    disposed = true;
    removeRecoveryListeners();
  };
}
