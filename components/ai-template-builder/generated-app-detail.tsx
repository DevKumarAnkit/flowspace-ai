"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Cloud, CloudAlert } from "lucide-react";
import { saveGeneratedAppStateAction } from "@/app/ai-template-builder/actions";
import { GeneratedAppRenderer } from "@/components/ai-template-builder/generated-app-renderer";
import type { GeneratedApp, GeneratedAppState } from "@/lib/generated-app-domain";

export function GeneratedAppDetail({ app }: { app: GeneratedApp }) {
  const [state, setState] = useState(app.state);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus("saving");
    const timeout = window.setTimeout(async () => {
      try { await saveGeneratedAppStateAction(app.id, state); setStatus("saved"); }
      catch { setStatus("error"); }
    }, 550);
    return () => window.clearTimeout(timeout);
  }, [app.id, state]);
  const statusContent = status === "saving" ? <><Cloud size={14} /> Saving changes…</> : status === "error" ? <><CloudAlert size={14} /> Changes could not be saved</> : <><CheckCircle2 size={14} /> All changes saved</>;
  return <div className="generated-detail-content"><div className="generated-detail-toolbar"><Link href="/ai-template-builder"><ArrowLeft size={14} /> Back to Template Builder</Link><div className={`generated-save-status ${status}`}>{statusContent}</div></div><GeneratedAppRenderer definition={app.definition} state={state} interactive onStateChange={(next: GeneratedAppState) => setState(next)} /></div>;
}
