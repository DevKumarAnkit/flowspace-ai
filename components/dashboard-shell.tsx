"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bell,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  Grid2X2,
  LayoutDashboard,
  LayoutTemplate,
  Menu,
  MoreHorizontal,
  MousePointer2,
  Plus,
  Search,
  Settings,
  Sparkles,
  SquareKanban,
  StickyNote,
  Users,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";

type NavigationGroup = {
  label: string;
  items: Array<{
    label: string;
    icon: LucideIcon;
    color: string;
    active?: boolean;
    badge?: string;
    href?: string;
  }>;
};

const navigation: NavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, color: "icon-violet", active: true },
      { label: "AI Assistant", icon: Bot, color: "icon-rose", href: "/assistant" },
      { label: "Calendar", icon: CalendarDays, color: "icon-blue", href: "/calendar" },
      { label: "Task / Kanban", icon: SquareKanban, color: "icon-amber", href: "/kanban" },
    ],
  },
  {
    label: "Create",
    items: [
      { label: "Notes", icon: StickyNote, color: "icon-green", href: "/notes" },
      { label: "Whiteboard", icon: MousePointer2, color: "icon-cyan", href: "/whiteboard" },
      { label: "Pages / Spaces", icon: FileText, color: "icon-orange", href: "/spaces" },
      { label: "AI Template Builder", icon: LayoutTemplate, color: "icon-pink", badge: "AI" },
    ],
  },
  {
    label: "System",
    items: [{ label: "Settings", icon: Settings, color: "icon-slate" }],
  },
];

const tasks = [
  { title: "Finalize Q3 product roadmap", project: "Flowspace", time: "10:00 AM", color: "violet" },
  { title: "Review new dashboard concepts", project: "Design", time: "1:30 PM", color: "orange" },
  { title: "Team async check-in", project: "Weekly", time: "3:00 PM", color: "green" },
];

const activity = [
  { initials: "MK", name: "Maya", action: "commented on", item: "Homepage concepts", time: "8m", tone: "peach" },
  { initials: "JL", name: "Jon", action: "completed", item: "User interviews", time: "42m", tone: "blue" },
  { initials: "AI", name: "Flow AI", action: "created a summary in", item: "Research", time: "1h", tone: "violet" },
];

export function DashboardShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      {mobileOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
        <div className="sidebar-header">
          <div className="brand-mark" aria-hidden="true"><Sparkles size={18} strokeWidth={2.4} /></div>
          {!collapsed && <span className="brand-name">Flowspace</span>}
          <button className="mobile-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>

        <button className="workspace-switcher" title={collapsed ? "Acme Studio" : undefined}>
          <span className="workspace-avatar">A</span>
          {!collapsed && <><span className="workspace-copy"><strong>Acme Studio</strong><small>Free workspace</small></span><ChevronDown size={14} /></>}
        </button>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              {!collapsed && <p className="nav-label">{group.label}</p>}
              {group.items.map((item) => {
                const Icon = item.icon;
                const content = <><span className={`nav-icon ${item.color}`}><Icon size={16} strokeWidth={2.1} /></span>{!collapsed && <><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}</>}</>;
                return item.href ? (
                  <Link className="nav-item" href={item.href} key={item.label} title={collapsed ? item.label : undefined} onClick={() => setMobileOpen(false)}>{content}</Link>
                ) : (
                  <button className={`nav-item ${item.active ? "active" : ""}`} key={item.label} title={collapsed ? item.label : undefined}>
                    {content}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && (
            <div className="upgrade-card">
              <div className="upgrade-icon"><WandSparkles size={16} /></div>
              <strong>Unlock your flow</strong>
              <span>Get unlimited AI & spaces.</span>
              <Link href="/settings?section=subscription">Explore Pro <ArrowUpRight size={13} /></Link>
            </div>
          )}
          <button className="profile-row" title={collapsed ? "Avery Morgan" : undefined}>
            <span className="profile-avatar">AM<span /></span>
            {!collapsed && <><span className="profile-copy"><strong>Avery Morgan</strong><small>avery@acme.co</small></span><MoreHorizontal size={16} /></>}
          </button>
        </div>

        <button className="collapse-button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
            <div className="crumb"><Grid2X2 size={15} /><span>Workspace</span><ChevronRight size={13} /><strong>Dashboard</strong></div>
          </div>
          <div className="topbar-actions">
            <label className="search-box"><Search size={16} /><input aria-label="Search" placeholder="Search anything..." /><kbd>⌘ K</kbd></label>
            <button className="icon-button" aria-label="Help"><CircleHelp size={18} /></button>
            <button className="icon-button notification" aria-label="Notifications"><Bell size={18} /><span /></button>
            <button className="create-button"><Plus size={17} /> Create</button>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="welcome-row">
            <div className="hero-glow hero-glow-one" />
            <div className="hero-glow hero-glow-two" />
            <div className="welcome-copy">
              <p className="eyebrow">SUNDAY, JULY 19 <i /> YOUR DAY AT A GLANCE</p>
              <h1>Good morning, Avery <span>✦</span></h1>
              <p>Everything is moving beautifully. Let’s make today count.</p>
              <div className="welcome-pills"><span><Check size={12} /> 3 tasks today</span><span><Users size={12} /> 3 teammates online</span></div>
            </div>
            <div className="hero-side">
              <div className="focus-score">
                <div className="score-ring"><span>78<small>%</small></span></div>
                <div><strong>Weekly rhythm</strong><small><i>↗ 12%</i> from last week</small></div>
              </div>
              <div className="member-stack"><span>MK</span><span>JL</span><span>SA</span><button aria-label="Invite a teammate"><Plus size={14} /></button></div>
            </div>
          </section>

          <section className="quick-grid" aria-label="Quick actions">
            <button className="quick-card purple"><span><StickyNote size={18} /></span><div><strong>New note</strong><small>Capture an idea</small></div><Plus size={15} /></button>
            <Link className="quick-card blue" href="/whiteboard"><span><MousePointer2 size={18} /></span><div><strong>New whiteboard</strong><small>Map it visually</small></div><Plus size={15} /></Link>
            <button className="quick-card orange"><span><SquareKanban size={18} /></span><div><strong>New task</strong><small>Plan your next step</small></div><Plus size={15} /></button>
            <button className="quick-card green"><span><Bot size={18} /></span><div><strong>Ask Flow AI</strong><small>Create with AI</small></div><Sparkles size={15} /></button>
          </section>

          <section className="ai-brief">
            <div className="ai-brief-icon"><Sparkles size={17} /></div>
            <div><span>FLOW AI SUGGESTION</span><strong>Turn your 5 meeting notes into a focused action plan</strong></div>
            <button>Make it happen <ArrowUpRight size={14} /></button>
          </section>

          <div className="dashboard-grid">
            <section className="panel focus-panel">
              <div className="panel-heading"><div><span className="heading-icon violet-bg"><Check size={16} /></span><div><h2>Today’s focus</h2><p>3 tasks on your plate</p></div></div><button>View all <ArrowUpRight size={14} /></button></div>
              <div className="task-list">
                {tasks.map((task, index) => <div className="task-row" key={task.title}><button className={`task-check ${index === 2 ? "done" : ""}`}>{index === 2 && <Check size={12} />}</button><div className={index === 2 ? "completed-task" : ""}><strong>{task.title}</strong><span><i className={task.color} />{task.project}</span></div><time><Clock3 size={13} />{task.time}</time><button className="more-button"><MoreHorizontal size={17} /></button></div>)}
              </div>
              <button className="add-task"><Plus size={15} /> Add a task</button>
            </section>

            <section className="panel activity-panel">
              <div className="panel-heading"><div><span className="heading-icon peach-bg"><Users size={16} /></span><div><h2>Recent activity</h2><p>Across your workspace</p></div></div><button><MoreHorizontal size={18} /></button></div>
              <div className="activity-list">
                {activity.map((entry) => <div className="activity-row" key={entry.name}><span className={`activity-avatar ${entry.tone}`}>{entry.initials}</span><p><strong>{entry.name}</strong> {entry.action} <b>{entry.item}</b><small>{entry.time} ago</small></p></div>)}
              </div>
              <button className="activity-link">See all activity <ArrowUpRight size={14} /></button>
            </section>

            <section className="panel spaces-panel">
              <div className="panel-heading"><div><span className="heading-icon blue-bg"><FileText size={16} /></span><div><h2>Your spaces</h2><p>Jump back into your work</p></div></div><Link href="/spaces">View all <ArrowUpRight size={14} /></Link></div>
              <div className="space-cards">
                <article className="space-card lavender"><div><span>🚀</span><button><MoreHorizontal size={16} /></button></div><h3>Product Hub</h3><p>12 pages · Updated 2h ago</p><div className="mini-avatars"><span>MK</span><span>JL</span><i>+3</i></div></article>
                <article className="space-card mint"><div><span>🌿</span><button><MoreHorizontal size={16} /></button></div><h3>Design System</h3><p>8 pages · Updated yesterday</p><div className="mini-avatars"><span>AM</span><span>SA</span><i>+2</i></div></article>
                <Link className="new-space" href="/spaces"><span><Plus size={19} /></span><strong>New space</strong><small>Start something fresh</small></Link>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
