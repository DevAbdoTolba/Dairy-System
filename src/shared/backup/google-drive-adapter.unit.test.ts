import { afterEach, describe, expect, it, vi } from "vitest";
import { createGoogleDriveState, validateGoogleDriveState } from "./google-drive-adapter";

const priorSecret = process.env.DAIRY_SESSION_SECRET;

afterEach(() => {
  vi.useRealTimers();
  if (priorSecret) process.env.DAIRY_SESSION_SECRET = priorSecret;
  else delete process.env.DAIRY_SESSION_SECRET;
});

describe("Google Drive OAuth state", () => {
  it("accepts an unexpired signed state and rejects a tampered one", () => {
    process.env.DAIRY_SESSION_SECRET = "test-session-secret";
    const state = createGoogleDriveState();

    expect(validateGoogleDriveState(state)).toBe(true);
    expect(validateGoogleDriveState(`${state}x`)).toBe(false);
  });

  it("expires after ten minutes", () => {
    process.env.DAIRY_SESSION_SECRET = "test-session-secret";
    vi.useFakeTimers({ now: new Date("2026-08-29T12:00:00.000Z") });
    const state = createGoogleDriveState();
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(validateGoogleDriveState(state)).toBe(false);
  });
});
