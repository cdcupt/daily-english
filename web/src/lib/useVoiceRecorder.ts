"use client";

import { useCallback, useRef, useState } from "react";

const CANDIDATE_MIMES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickMime(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }
  for (const m of CANDIDATE_MIMES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

export interface VoiceRecording {
  blob: Blob;
  mime: string;
  filename: string;
}

type RecorderState = "idle" | "recording" | "unsupported";

/**
 * MediaRecorder wrapper with mime feature-detection. Produces a Blob suitable
 * for the multipart /turns/audio endpoint. Returns "unsupported" when the
 * browser lacks MediaRecorder so the UI can fall back to typing.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>(() =>
    pickMime() ? "idle" : "unsupported",
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    const mime = pickMime();
    if (!mime) {
      setState("unsupported");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.start();
      recorderRef.current = rec;
      setState("recording");
      return true;
    } catch {
      setState("idle");
      return false;
    }
  }, []);

  const stop = useCallback((): Promise<VoiceRecording | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec) {
        resolve(null);
        return;
      }
      rec.onstop = () => {
        const mime = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setState("idle");
        const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
        resolve({ blob, mime, filename: `answer.${ext}` });
      };
      rec.stop();
    });
  }, []);

  return { state, start, stop, supported: state !== "unsupported" };
}
