"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AudioLines, Bot, Check, House, LoaderCircle, Mic, PhoneCall, PhoneOff, Send, Sparkles, SquareKanban, CalendarDays, FileText, LayoutTemplate, X } from "lucide-react";
import type { AssistantConversation } from "@/lib/assistant-server";
import { useVoiceAgent } from "@/components/assistant/use-voice-agent";

type ClientAction = NonNullable<AssistantConversation["actions"]>[number];
type ClientMessage = AssistantConversation["messages"][number];

const suggestions = [
  { label: "Create a task for tomorrow", icon: SquareKanban }, { label: "Add meeting reminder on calendar", icon: CalendarDays },
  { label: "Summarize my notes", icon: FileText }, { label: "Create a Kanban board", icon: SquareKanban },
  { label: "Plan my week", icon: Sparkles }, { label: "Generate a habit tracker template", icon: LayoutTemplate },
];

export function AssistantPage({ initialConversation }: { initialConversation: AssistantConversation | null }) {
  const [conversationId, setConversationId] = useState<number | null>(initialConversation?.id ?? null);
  const [messages, setMessages] = useState<ClientMessage[]>(initialConversation?.messages ?? []);
  const [actions, setActions] = useState<ClientAction[]>(initialConversation?.actions ?? []);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [showOverview, setShowOverview] = useState(true);
  const [liveTranscript, setLiveTranscript] = useState<{ role: "user" | "assistant"; text: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  async function saveVoiceMessage(role: "user" | "assistant", content: string) {
    const response = await fetch("/api/assistant/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, role, content }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to save voice transcript.");
    setConversationId(data.conversationId); setMessages((current) => [...current, data.message]);
  }
  const voice = useVoiceAgent({ onUserTranscript: (content) => { setShowOverview(false); setLiveTranscript(null); void sendVoiceCommand(content); }, onAgentTranscript: (content) => { setShowOverview(false); setLiveTranscript(null); void saveVoiceMessage("assistant", content).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to save voice transcript.")); }, onUserPartial: (text) => { setShowOverview(false); setLiveTranscript({ role: "user", text }); }, onAgentPartial: (text) => { setShowOverview(false); setLiveTranscript({ role: "assistant", text }); } });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, actions, loading]);

  async function send(value = prompt) {
    const text = value.trim(); if (!text || loading) return;
    setPrompt(""); setError(""); setLoading(true);
    try {
      const response = await fetch("/api/assistant/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, conversationId }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to reach the assistant.");
      setConversationId(data.conversationId);
      setMessages((current) => [...current, data.userMessage, data.assistantMessage]);
      if (data.action) { setActions((current) => [...current, data.action]); void confirm(data.action.id); }
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to reach the assistant."); }
    finally { setLoading(false); }
  }

  async function sendVoiceCommand(content: string) {
    const text = content.trim(); if (!text || loading) return;
    setError(""); setLoading(true);
    try {
      const response = await fetch("/api/assistant/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, conversationId }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to process your voice command.");
      setConversationId(data.conversationId); setMessages((current) => [...current, data.userMessage, data.assistantMessage]);
      if (data.action) { setActions((current) => [...current, data.action]); void confirm(data.action.id); }
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to process your voice command."); }
    finally { setLoading(false); }
  }

  async function confirm(actionId: number) {
    setError("");
    try {
      const response = await fetch(`/api/assistant/actions/${actionId}/confirm`, { method: "POST" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to perform action.");
      setActions((current) => current.map((action) => action.id === actionId ? { ...action, status: "completed", result: data.result } : action));
      setMessages((current) => [...current, { id: Date.now(), role: "assistant", content: data.result.message, createdAt: new Date().toISOString() }]);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to perform action."); }
  }

  function updatePrompt(event: React.ChangeEvent<HTMLTextAreaElement>) { setPrompt(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`; }
  return <section className="assistant-page">
    <header className="assistant-page-head"><span><Bot size={14} /> AI Assistant</span><button onClick={() => { setShowOverview((visible) => !visible); requestAnimationFrame(() => { if (chatRef.current) chatRef.current.scrollTop = 0; }); }}><House size={15} /> {showOverview ? "Open chat" : "Assistant home"}</button></header>
    <div className="assistant-chat" ref={chatRef}>
      {showOverview && <EmptyState choose={(value) => { setShowOverview(false); void send(value); }} />}
      {!showOverview && messages.length > 0 && <div className="assistant-messages">
        {messages.map((message) => <article key={message.id} className={`assistant-message ${message.role}`}><span className="assistant-avatar">{message.role === "assistant" ? <Bot size={16} /> : "You"}</span><p>{message.content}</p></article>)}
        {liveTranscript && <article className={`assistant-message ${liveTranscript.role} assistant-live-message`}><span className="assistant-avatar">{liveTranscript.role === "assistant" ? <Bot size={16} /> : "You"}</span><p>{liveTranscript.text}<i /></p></article>}
        {actions.map((action) => <ActionCard key={action.id} action={action} confirm={confirm} />)}
        {loading && <div className="assistant-typing"><Bot size={16} /><i /><i /><i /></div>}
      </div>}
      <div ref={endRef} />
    </div>
    {error && <div className="assistant-error" role="status"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></div>}
    <div className="assistant-composer-wrap">
      {voiceOpen && <aside className={`assistant-voice-panel ${voice.status}`} aria-live="polite">
        <div className="assistant-voice-panel-head"><span className="assistant-voice-orb"><AudioLines size={18} /></span><section><strong>{voice.status === "listening" ? "Bulbul is listening" : voice.status === "connecting" ? "Connecting to Bulbul" : voice.status === "error" ? "Voice needs attention" : "Talk with Bulbul"}</strong><p>{voice.status === "listening" ? "Speak naturally. Bulbul will listen and reply out loud." : voice.status === "connecting" ? "Preparing your secure voice conversation…" : voice.status === "error" ? voice.error || "Check your microphone permission and try again." : "Start a real-time, two-way voice conversation."}</p></section><button className="assistant-voice-close" onClick={() => setVoiceOpen(false)} aria-label="Close voice controls"><X size={16} /></button></div>
        {voice.status === "listening" ? <button className="assistant-voice-end" onClick={voice.stop}><PhoneOff size={16} /> End conversation</button> : <button className="assistant-voice-start" disabled={voice.status === "connecting"} onClick={() => { setShowOverview(false); void voice.start(); }}>{voice.status === "connecting" ? <LoaderCircle className="spin" size={16} /> : <PhoneCall size={16} />}{voice.status === "connecting" ? "Connecting…" : "Start conversation"}</button>}
        <small>{voice.status === "idle" ? "Bulbul will say: “Hello, I am Bulbul. How can I help you?”" : "Your final speech transcripts are saved in this conversation."}</small>
      </aside>}
      <div className="assistant-composer">
        <button className={`assistant-voice ${voice.status === "listening" ? "listening" : ""}`} onClick={() => setVoiceOpen((open) => !open)} aria-label="Open voice controls"><Mic size={19} /></button>
        <textarea value={prompt} onChange={updatePrompt} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={voice.status === "listening" ? "Listening…" : "Ask Flowspace anything…"} rows={1} />
        <button className="assistant-send" disabled={!prompt.trim() || loading} onClick={() => void send()} aria-label="Send message">{loading ? <LoaderCircle size={18} className="spin" /> : <Send size={18} />}</button>
      </div>
      <small>{voice.status === "listening" ? "Bulbul is listening · Open the microphone controls to end the call" : "Shift + Enter for a new line"}</small>
    </div>
  </section>;
}

function EmptyState({ choose }: { choose: (value: string) => void }) {
  return <div className="assistant-empty"><div className="assistant-orb"><Sparkles size={26} /></div><h1>Your AI Assistant</h1><p>Plan your day, find focus, and turn ideas into action across Flowspace.</p><div className="assistant-suggestions">{suggestions.map(({ label, icon: Icon }) => <button key={label} onClick={() => choose(label)}><Icon size={17} /><span>{label}</span></button>)}</div></div>;
}

function ActionCard({ action, confirm }: { action: ClientAction; confirm: (id: number) => Promise<void> }) {
  const result = action.result as { message?: string; href?: string } | null;
  return <div className={`assistant-action-card ${action.status}`}><div><span><Sparkles size={15} /></span><section><strong>Ready when you are</strong><p>{action.summary}</p></section></div>{action.status === "pending" ? <button onClick={() => void confirm(action.id)}><Check size={15} /> Confirm action</button> : <footer>{action.status === "completed" ? <>{result?.href ? <Link href={result.href}>Open result</Link> : "Completed"}</> : "Could not complete this action"}</footer>}</div>;
}
