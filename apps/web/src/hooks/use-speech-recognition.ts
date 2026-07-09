"use client";

import { useCallback, useRef } from "react";

interface UseSpeechRecognitionOptions {
  lang?: string;
  onResult?: (text: string) => void;
  onError?: (message: string) => void;
}

export function useSpeechRecognition({
  lang = "ja-JP",
  onResult,
  onError,
}: UseSpeechRecognitionOptions = {}) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const start = useCallback(() => {
    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionCtor) {
      onError?.("浏览器不支持语音识别");
      return false;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onResult?.(transcript);
    };
    recognition.onerror = () => onError?.("语音识别失败");
    recognitionRef.current = recognition;
    recognition.start();
    return true;
  }, [lang, onResult, onError]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { start, stop };
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}
