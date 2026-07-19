"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ASSEMBLYAI_SAMPLE_RATE,
  ASSEMBLYAI_SESSION_LIMIT_MS,
  parseAssemblyAIMessage,
} from "@/lib/assemblyai-streaming";

export type AssemblyAIStreamingStatus = "idle" | "requesting-permission" | "connecting" | "recording" | "stopping" | "error";

type TokenResponse = { token?: string; expiresInSeconds?: number; maxSessionDurationSeconds?: number; error?: string };

const FORCE_ENDPOINT_TIMEOUT_MS = 1_600;
const TERMINATION_TIMEOUT_MS = 1_500;

function microphoneError(error: unknown) {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return "Microphone access was denied. Allow microphone permission and try again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") return "No microphone was found on this device.";
  return error instanceof Error ? error.message : "Unable to start microphone transcription.";
}

export function useAssemblyAIStreaming({ onFinalTranscript }: { onFinalTranscript: (text: string, turnOrder: number) => void }) {
  const [status, setStatus] = useState<AssemblyAIStreamingStatus>("idle");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const statusRef = useRef<AssemblyAIStreamingStatus>("idle");
  const previewRef = useRef("");
  const callbackRef = useRef(onFinalTranscript);
  const mountedRef = useRef(true);
  const sessionRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const muteRef = useRef<GainNode | null>(null);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shutdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizedTurnsRef = useRef(new Set<number>());
  const stopReasonRef = useRef<"manual" | "limit">("manual");
  const terminatingRef = useRef(false);

  callbackRef.current = onFinalTranscript;

  const updateStatus = useCallback((next: AssemblyAIStreamingStatus) => {
    statusRef.current = next;
    if (mountedRef.current) setStatus(next);
  }, []);

  const updatePreview = useCallback((next: string) => {
    previewRef.current = next;
    if (mountedRef.current) setPreview(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    if (shutdownTimerRef.current) clearTimeout(shutdownTimerRef.current);
    limitTimerRef.current = null;
    shutdownTimerRef.current = null;
  }, []);

  const releaseAudio = useCallback(() => {
    workletRef.current?.disconnect();
    sourceRef.current?.disconnect();
    muteRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void contextRef.current?.close().catch(() => undefined);
    workletRef.current = null;
    sourceRef.current = null;
    muteRef.current = null;
    streamRef.current = null;
    contextRef.current = null;
  }, []);

  const finish = useCallback((failure = "") => {
    clearTimers();
    releaseAudio();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) socket.close();
    terminatingRef.current = false;
    finalizedTurnsRef.current.clear();
    updatePreview("");
    if (failure) {
      if (mountedRef.current) setError(failure);
      updateStatus("error");
    } else {
      updateStatus("idle");
      if (stopReasonRef.current === "limit" && mountedRef.current) {
        setNotice("Two-minute recording limit reached. Start a new recording to continue.");
      }
    }
  }, [clearTimers, releaseAudio, updatePreview, updateStatus]);

  const sendTerminate = useCallback(() => {
    if (terminatingRef.current) return;
    terminatingRef.current = true;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      finish();
      return;
    }
    socket.send(JSON.stringify({ type: "Terminate" }));
    shutdownTimerRef.current = setTimeout(() => finish(), TERMINATION_TIMEOUT_MS);
  }, [finish]);

  const stopRecording = useCallback((reason: "manual" | "limit" = "manual") => {
    if (["idle", "error", "stopping"].includes(statusRef.current)) return;
    sessionRef.current += 1;
    stopReasonRef.current = reason;
    updateStatus("stopping");
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    limitTimerRef.current = null;
    releaseAudio();
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      finish();
      return;
    }
    if (previewRef.current.trim()) {
      socket.send(JSON.stringify({ type: "ForceEndpoint" }));
      shutdownTimerRef.current = setTimeout(sendTerminate, FORCE_ENDPOINT_TIMEOUT_MS);
    } else {
      sendTerminate();
    }
  }, [finish, releaseAudio, sendTerminate, updateStatus]);

  const startRecording = useCallback(async () => {
    if (!["idle", "error"].includes(statusRef.current)) return;
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    stopReasonRef.current = "manual";
    terminatingRef.current = false;
    finalizedTurnsRef.current.clear();
    if (mountedRef.current) { setError(""); setNotice(""); }
    updatePreview("");

    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined" || typeof AudioWorkletNode === "undefined") {
      finish("Live microphone transcription is not supported in this browser. Use a current browser over HTTPS or localhost.");
      return;
    }

    try {
      updateStatus("requesting-permission");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (session !== sessionRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;

      const context = new AudioContext();
      contextRef.current = context;
      await context.resume();
      updateStatus("connecting");
      const [response] = await Promise.all([
        fetch("/api/assemblyai/token", { method: "POST", cache: "no-store" }),
        context.audioWorklet.addModule("/assemblyai-pcm-processor.js"),
      ]);
      const data = await response.json().catch(() => ({})) as TokenResponse;
      if (!response.ok || !data.token) throw new Error(data.error || "Unable to create a secure transcription session.");
      if (session !== sessionRef.current) return;

      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, "assemblyai-pcm-processor", {
        processorOptions: { inputSampleRate: context.sampleRate, targetSampleRate: ASSEMBLYAI_SAMPLE_RATE, chunkSamples: 800 },
      });
      const mute = context.createGain();
      mute.gain.value = 0;
      sourceRef.current = source;
      workletRef.current = worklet;
      muteRef.current = mute;

      const url = new URL("wss://streaming.assemblyai.com/v3/ws");
      url.searchParams.set("token", data.token);
      url.searchParams.set("speech_model", "universal-streaming-english");
      url.searchParams.set("sample_rate", String(ASSEMBLYAI_SAMPLE_RATE));
      url.searchParams.set("format_turns", "true");
      const socket = new WebSocket(url);
      socketRef.current = socket;

      worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (statusRef.current === "recording" && socket.readyState === WebSocket.OPEN) socket.send(event.data);
      };
      socket.onmessage = (event) => {
        if (socketRef.current !== socket) return;
        if (typeof event.data !== "string") return;
        const message = parseAssemblyAIMessage(event.data);
        if (!message) return;
        if (message.type === "Begin") {
          source.connect(worklet);
          worklet.connect(mute);
          mute.connect(context.destination);
          updateStatus("recording");
          limitTimerRef.current = setTimeout(() => stopRecording("limit"), ASSEMBLYAI_SESSION_LIMIT_MS);
          return;
        }
        if (message.type === "Turn") {
          if (message.endOfTurn) {
            if (message.transcript.trim() && !finalizedTurnsRef.current.has(message.turnOrder)) {
              finalizedTurnsRef.current.add(message.turnOrder);
              callbackRef.current(message.transcript, message.turnOrder);
            }
            updatePreview("");
            if (statusRef.current === "stopping") {
              if (shutdownTimerRef.current) clearTimeout(shutdownTimerRef.current);
              shutdownTimerRef.current = null;
              sendTerminate();
            }
          } else {
            updatePreview(message.transcript);
          }
          return;
        }
        if (message.type === "Termination") finish();
      };
      socket.onerror = () => {
        if (socketRef.current === socket) finish("The live transcription connection failed. Please try again.");
      };
      socket.onclose = (event) => {
        if (socketRef.current !== socket) return;
        if (event.code === 3008) stopReasonRef.current = "limit";
        if (statusRef.current === "stopping" || terminatingRef.current || event.code === 1000) finish();
        else if (event.code === 3008) finish();
        else finish(event.reason || "The live transcription session ended unexpectedly. Please try again.");
      };
    } catch (caught) {
      finish(microphoneError(caught));
    }
  }, [finish, sendTerminate, stopRecording, updatePreview, updateStatus]);

  useEffect(() => () => {
    mountedRef.current = false;
    sessionRef.current += 1;
    clearTimers();
    releaseAudio();
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "Terminate" }));
    socket?.close();
    socketRef.current = null;
  }, [clearTimers, releaseAudio]);

  const clearNotice = useCallback(() => setNotice(""), []);
  const clearError = useCallback(() => { setError(""); if (statusRef.current === "error") updateStatus("idle"); }, [updateStatus]);
  const isRecording = status !== "idle" && status !== "error";
  const isBusy = status === "stopping";

  return { status, preview, error, notice, isRecording, isBusy, startRecording, stopRecording, clearNotice, clearError };
}
