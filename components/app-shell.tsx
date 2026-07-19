"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bell,
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
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
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";

type NavigationItem = { label: string; icon: LucideIcon; color: string; href?: string; badge?: string };
const navigation: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, color: "icon-violet", href: "/" },
      { label: "AI Assistant", icon: Bot, color: "icon-rose" },
      { label: "Calendar", icon: CalendarDays, color: "icon-blue", href: "/calendar" },
      { label: "Task / Kanban", icon: SquareKanban, color: "icon-amber", href: "/kanban" },
    ],
  },
  {
    label: "Create",
    items: [
      { label: "Notes", icon: StickyNote, color: "icon-green", href: "/notes" },
      { label: "Whiteboard", icon: MousePointer2, color: "icon-cyan", href: "/whiteboard" },
      { label: "Pages / Spaces", icon: FileText, color: "icon-orange" },
      { label: "AI Template Builder", icon: LayoutTemplate, color: "icon-pink", badge: "AI" },
    ],
  },
  { label: "System", items: [{ label: "Settings", icon: Settings, color: "icon-slate" }] },
];

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
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
                const active = item.href ? (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)) : false;
                const contents = <><span className={`nav-icon ${item.color}`}><Icon size={16} strokeWidth={2.1} /></span>{!collapsed && <><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}</>}</>;
                return item.href ? (
                  <Link className={`nav-item ${active ? "active" : ""}`} href={item.href} key={item.label} title={collapsed ? item.label : undefined} onClick={() => setMobileOpen(false)}>{contents}</Link>
                ) : (
                  <button className="nav-item" key={item.label} title={collapsed ? item.label : undefined}>{contents}</button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          {!collapsed && <div className="upgrade-card"><div className="upgrade-icon"><WandSparkles size={16} /></div><strong>Unlock your flow</strong><span>Get unlimited AI & spaces.</span><button>Explore Pro <ArrowUpRight size={13} /></button></div>}
          <button className="profile-row" title={collapsed ? "Avery Morgan" : undefined}>
            <span className="profile-avatar">AM<span /></span>
            {!collapsed && <><span className="profile-copy"><strong>Avery Morgan</strong><small>avery@acme.co</small></span><MoreHorizontal size={16} /></>}
          </button>
        </div>
        <button className="collapse-button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
            <div className="crumb"><Grid2X2 size={15} /><span>Workspace</span><ChevronRight size={13} /><strong>{title}</strong></div>
          </div>
          <div className="topbar-actions">
            <label className="search-box"><Search size={16} /><input aria-label="Search" placeholder="Search anything..." /><kbd>⌘ K</kbd></label>
            <button className="icon-button" aria-label="Help"><CircleHelp size={18} /></button>
            <button className="icon-button notification" aria-label="Notifications"><Bell size={18} /><span /></button>
            <button className="create-button"><Plus size={17} /> Create</button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
