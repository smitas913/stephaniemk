import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Android Chrome camera capture helpers.
 *
 * Two problems this solves:
 *  1. A hidden <input type="file" capture="environment"> rendered inside a Radix
 *     DialogContent sits inside the dialog's focus trap / pointer-events guard.
 *     When Android Chrome hands control back from the camera app, the trap can
 *     re-focus the dialog before the input's change event is dispatched, so the
 *     photo is silently dropped. Creating the input on document.body (outside
 *     any portal/trap) and clicking it there avoids that entirely.
 *  2. Android Chrome may discard/reload the backgrounded tab while the camera
 *     app is in the foreground. All React state is lost, so the user comes back
 *     to a blank screen with no explanation. We drop a sessionStorage marker
 *     before opening the camera and, if it survives a fresh page load, tell the
 *     user the scan was interrupted.
 */

const FLAG_KEY = "mkcrm:scan-capture-in-progress";

function markInProgress() {
  try {
    sessionStorage.setItem(FLAG_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

function clearInProgress() {
  try {
    sessionStorage.removeItem(FLAG_KEY);
  } catch {
    /* ignore */
  }
}

/** Returns true (once) if a capture was in flight when the page last unloaded. */
export function consumeInterruptedCapture(): boolean {
  try {
    const raw = sessionStorage.getItem(FLAG_KEY);
    if (!raw) return false;
    clearInProgress();
    const started = Number(raw);
    if (!Number.isFinite(started)) return false;
    // Only treat recent captures as interrupted, so a stale flag can't nag later.
    return Date.now() - started < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Opens the camera / photo picker via a throwaway input attached to
 * document.body, so no dialog focus trap can swallow the change event.
 */
export function useCameraCapture(onFile: (file: File) => void) {
  const cb = useRef(onFile);
  cb.current = onFile;

  return useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    // Keep it out of view but still clickable/interactive.
    input.style.position = "fixed";
    input.style.left = "-10000px";
    input.style.top = "0";
    input.style.opacity = "0";
    input.setAttribute("aria-hidden", "true");
    document.body.appendChild(input);

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearInProgress();
      window.removeEventListener("focus", onReturn);
      // Defer removal so the change event finishes dispatching first.
      setTimeout(() => input.remove(), 0);
    };

    const onReturn = () => {
      // If we regain focus and no file ever arrives, the user cancelled.
      setTimeout(() => {
        if (!input.files || input.files.length === 0) cleanup();
      }, 4000);
    };

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      cleanup();
      if (file) cb.current(file);
    });
    input.addEventListener("cancel", cleanup);
    window.addEventListener("focus", onReturn);

    markInProgress();
    input.click();
  }, []);
}

/** Mount once near the app root to surface interrupted-capture reloads. */
export function useCaptureInterruptionNotice() {
  useEffect(() => {
    if (consumeInterruptedCapture()) {
      toast.info("That got interrupted — please try scanning again", {
        description: "Your phone reloaded the page while the camera was open, so the photo was lost.",
      });
    }
  }, []);
}
