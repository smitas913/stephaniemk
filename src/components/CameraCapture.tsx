import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openCameraInput, openPhotoLibrary } from "@/lib/scanCapture";

/**
 * In-page camera.
 *
 * Android Chrome discards backgrounded tabs under memory pressure, so handing
 * off to the OS camera app (input capture="environment") can silently destroy
 * all in-progress scan state. Capturing the frame in-page with getUserMedia
 * keeps the tab in the foreground the whole time, so the OS never has a reason
 * to unload it. If getUserMedia is unavailable or blocked we fall back to the
 * old file-input handoff so the user is never stuck.
 */

type OverlayProps = {
  label: string;
  onCapture: (file: File) => void;
  onCancel: () => void;
  onUnavailable: (reason: string) => void;
};

function CameraOverlay({ label, onCapture, onCancel, onUnavailable }: OverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            /* autoplay guard — the muted+playsInline video usually starts anyway */
          }
        }
        setReady(true);
      } catch (err: any) {
        if (cancelled) return;
        onUnavailable(err?.name || "CameraError");
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shoot = () => {
    const video = videoRef.current;
    if (!video || busy) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      onUnavailable("NoCanvasContext");
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setBusy(false);
          onUnavailable("EncodeFailed");
          return;
        }
        const file = new File([blob], `card-${Date.now()}.jpg`, { type: "image/jpeg" });
        stopStream();
        onCapture(file);
      },
      "image/jpeg",
      0.9,
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <div className="flex items-center justify-between p-3 text-white">
        <span className="text-sm font-medium">{label}</span>
        <button
          type="button"
          aria-label="Cancel"
          onClick={() => {
            stopStream();
            onCancel();
          }}
          className="rounded-full p-2 hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-contain" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
            Starting camera…
          </div>
        )}
      </div>

      <div className="p-5 flex items-center justify-center">
        <Button
          type="button"
          onClick={shoot}
          disabled={!ready || busy}
          className="h-16 w-16 rounded-full p-0"
          aria-label="Take photo"
        >
          <Camera className="w-7 h-7" />
        </Button>
      </div>
    </div>,
    document.body,
  );
}

type Pending = { label: string; cb: (file: File) => void };

/**
 * Returns helpers for the scan dialogs:
 *  - takePhoto(cb, label): opens the in-page camera (falls back to OS camera)
 *  - chooseFromLibrary(cb): opens the photo picker (never the camera app)
 *  - cameraOverlay: render this inside the component tree
 */
export function usePhotoCapture() {
  const [pending, setPending] = useState<Pending | null>(null);

  const takePhoto = useCallback((cb: (file: File) => void, label = "Take photo") => {
    const supported =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function";
    if (!supported) {
      openCameraInput(cb);
      return;
    }
    setPending({ label, cb });
  }, []);

  const chooseFromLibrary = useCallback((cb: (file: File) => void) => {
    openPhotoLibrary(cb);
  }, []);

  const cameraOverlay = pending ? (
    <CameraOverlay
      label={pending.label}
      onCapture={(file) => {
        const cb = pending.cb;
        setPending(null);
        cb(file);
      }}
      onCancel={() => setPending(null)}
      onUnavailable={() => {
        const cb = pending.cb;
        setPending(null);
        // Permission denied / no device / encode failure — use the old handoff.
        openCameraInput(cb);
      }}
    />
  ) : null;

  return { takePhoto, chooseFromLibrary, cameraOverlay };
}
