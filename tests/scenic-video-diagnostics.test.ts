import { describe, expect, it } from "vitest";

import { snapshotScenicVideo } from "@/lib/ui/scenic-video-diagnostics";

describe("scenic video diagnostics", () => {
  it("captures the mobile media state needed to distinguish loading, decoding, and autoplay failures", () => {
    expect(snapshotScenicVideo({
      currentSrc: "http://example.test/scenic/dawn.mp4",
      readyState: 0,
      networkState: 3,
      paused: true,
      muted: true,
      currentTime: 0,
      videoWidth: 0,
      videoHeight: 0,
      error: { code: 4, message: "MEDIA_ERR_SRC_NOT_SUPPORTED" },
    })).toEqual({
      src: "http://example.test/scenic/dawn.mp4",
      readyState: 0,
      networkState: 3,
      paused: true,
      muted: true,
      currentTime: 0,
      dimensions: "0×0",
      errorCode: 4,
      errorMessage: "MEDIA_ERR_SRC_NOT_SUPPORTED",
    });
  });
});
