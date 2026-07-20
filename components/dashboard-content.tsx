import Link from "next/link";
import { ArrowUpRight, Bot, CalendarDays, Check, ChevronRight, Clock3, FileText, LayoutTemplate, MousePointer2, Plus, Sparkles, SquareKanban, StickyNote, Target, TrendingUp } from "lucide-react";
import type { DashboardData } from "@/app/dashboard/actions";

const icons = { calendar: CalendarDays, kanban: SquareKanban, notes: StickyNote, whiteboard: MousePointer2, assistant: Bot, template: LayoutTemplate } as const;
const colors: Record<string, string> = { blue: "#3979ca", amber: "#c37719", green: "#359568", cyan: "#2e9aa4", rose: "#d44f82", pink: "#a957c9" };

function relativeTime(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

function dateLabel(date: string | null, time: string | null) {
  if (!date) return "No date";
  const parsed = time ? new Date(time) : new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: time ? "numeric" : undefined, minute: time ? "2-digit" : undefined }).format(parsed);
}

export function DashboardContent({ data }: { data: DashboardData }) {
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  return <div className="dashboard-content dashboard-modern">
    <section className="dashboard-hero"><div><span className="eyebrow">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase()} <i /> YOUR DAY AT A GLANCE</span><h1>{greeting}, {data.user.name} <span>✦</span></h1><p>A calm view of everything moving through your workspace.</p><div className="hero-metrics"><span><Check size={13} /> {data.todayCount} on your calendar today</span><span><TrendingUp size={13} /> {data.taskSummary.percent}% task progress</span></div></div><div className="hero-score"><div className="score-ring"><strong>{data.taskSummary.percent}<small>%</small></strong></div><span><b>Weekly rhythm</b><small>Keep your momentum going</small></span></div></section>

    <section className="feature-grid">{data.featureStats.map((feature) => { const Icon = icons[feature.icon as keyof typeof icons]; const enabled = feature.key === "assistant" ? data.featureEnabled.assistant : feature.key === "templates" ? data.featureEnabled.templates : true; return <Link className={`feature-card ${feature.color} ${!enabled ? "is-disabled" : ""}`} href={feature.href} key={feature.key}><span className="feature-icon"><Icon size={18} /></span><span className="feature-copy"><b>{feature.name}</b><small>{enabled ? feature.detail : "Disabled in settings"}</small></span><strong>{feature.stat}</strong><ChevronRight size={15} /></Link>; })}</section>

    <section className="quick-grid dashboard-quick" aria-label="Quick actions">{data.quickActions.map((action) => { const Icon = icons[action.icon as keyof typeof icons]; return <Link className="quick-card" href={action.href} key={action.label} style={{ "--quick-color": colors[action.color] } as React.CSSProperties}><span><Icon size={18} /></span><div><strong>{action.label}</strong><small>{action.detail}</small></div><Plus size={15} /></Link>; })}</section>

    <div className="dashboard-grid dashboard-modern-grid">
      <section className="panel dashboard-panel task-summary-panel"><div className="panel-heading"><div><span className="heading-icon violet-bg"><Target size={16} /></span><div><h2>Task summary</h2><p>Your current workload at a glance</p></div></div><Link href="/kanban">Open Kanban <ArrowUpRight size={14} /></Link></div><div className="task-summary-main"><div className="summary-ring"><strong>{data.taskSummary.percent}<small>%</small></strong></div><div className="summary-stats"><span><b>{data.taskSummary.total}</b>Total tasks</span><span><b>{data.taskSummary.completed}</b>Completed</span><span><b>{data.taskSummary.pending}</b>Pending</span><span className="overdue"><b>{data.taskSummary.overdue}</b>Overdue</span></div></div><div className="progress-track"><i style={{ width: `${data.taskSummary.percent}%` }} /></div></section>
      <section className="panel dashboard-panel"><div className="panel-heading"><div><span className="heading-icon blue-bg"><CalendarDays size={16} /></span><div><h2>Coming up</h2><p>Calendar tasks and reminders</p></div></div><Link href="/calendar">View calendar <ArrowUpRight size={14} /></Link></div><div className="dashboard-list">{data.upcoming.length ? data.upcoming.map((item) => <Link className="upcoming-row" href="/calendar" key={item.id}><i style={{ background: item.color }} /><span><b>{item.title}</b><small><Clock3 size={11} /> {dateLabel(item.date, item.time)}</small></span><em>{item.type}</em></Link>) : <div className="dashboard-empty"><CalendarDays size={20} /><span>No upcoming events yet.</span><Link href="/calendar">Add one <ArrowUpRight size={13} /></Link></div>}</div></section>
      <section className="panel dashboard-panel activity-panel"><div className="panel-heading"><div><span className="heading-icon peach-bg"><Sparkles size={16} /></span><div><h2>Recent activity</h2><p>Latest movement across Flowspace</p></div></div></div><div className="dashboard-list activity-list-modern">{data.activity.length ? data.activity.map((entry) => <Link className="activity-row-modern" href={entry.href} key={entry.id}><span className={`activity-dot ${entry.tone}`} /><p><b>{entry.label}</b><strong>{entry.title}</strong><small>{relativeTime(entry.at)}</small></p><ArrowUpRight size={14} /></Link>) : <div className="dashboard-empty"><Sparkles size={20} /><span>Your activity will appear here.</span></div>}</div></section>
      <section className="panel dashboard-panel"><div className="panel-heading"><div><span className="heading-icon green-bg"><FileText size={16} /></span><div><h2>Recent pages</h2><p>Jump back into your work</p></div></div></div><div className="recent-resource-grid">{data.recent.length ? data.recent.map((item) => <Link href={item.href} className="resource-card" key={item.id}><span style={{ background: `${item.color}20`, color: item.color }}><FileText size={16} /></span><b>{item.title}</b><small>{item.type} · {relativeTime(item.at)}</small></Link>) : <div className="dashboard-empty"><FileText size={20} /><span>No pages created yet.</span><Link href="/notes">Create a note <ArrowUpRight size={13} /></Link></div>}</div></section>
    </div>
    <section className="ai-insights-panel"><div className="ai-insights-mark"><Sparkles size={19} /></div><div className="ai-insights-copy"><span>FLOW AI INSIGHTS</span><h2>A little clarity for your next move</h2><div className="insight-chips">{data.insights.map((insight) => <span key={insight}>{insight}</span>)}</div></div><Link href="/assistant">Ask Flow AI <ArrowUpRight size={14} /></Link></section>
  </div>;
}
