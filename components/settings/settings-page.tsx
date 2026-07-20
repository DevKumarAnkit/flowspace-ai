"use client";

import { PricingTable, useClerk } from "@clerk/nextjs";
import {
  Bell, BellRing, BookOpen, Bot, Briefcase, CalendarDays, Check, ChevronRight, Coffee, CreditCard,
  Download, Dumbbell, HardDrive, Heart, Home, LockKeyhole, Palette, Pencil, Plane, Plus, Save,
  Settings2, ShieldCheck, Sparkles, Tag, Trash2, UserRound, X, type LucideIcon,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction, updateSettingsAction } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AI_BEHAVIORS, AI_MODELS, AI_TONES, CALENDAR_VIEWS, CATEGORY_COLORS, CATEGORY_ICONS, TASK_PRIORITIES, THEMES,
  type CategoryScope, type SettingsPatch, type SettingsSnapshot, type UserCategory,
} from "@/lib/settings-domain";

type SettingsData = {
  profile: { name: string; email: string; imageUrl: string | null; createdAt: string };
  settings: SettingsSnapshot;
  categories: UserCategory[];
  usage: { calendar: number; tasks: number; notes: number; spaces: number; whiteboards: number; aiApps: number };
};

type Section = "profile" | "subscription" | "categories" | "ai" | "preferences" | "notifications" | "data" | "privacy";
const SECTION_ITEMS: Array<{ id: Section; label: string; icon: LucideIcon }> = [
  { id: "profile", label: "Profile", icon: UserRound }, { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "categories", label: "Categories", icon: Tag }, { id: "ai", label: "AI settings", icon: Bot },
  { id: "preferences", label: "Preferences", icon: Settings2 }, { id: "notifications", label: "Notifications", icon: Bell },
  { id: "data", label: "Data & export", icon: HardDrive }, { id: "privacy", label: "Privacy & security", icon: ShieldCheck },
];
const SCOPE_LABELS: Record<CategoryScope, string> = { calendar: "Calendar", task: "Tasks / Kanban", note: "Notes", reminder: "Reminders" };
const ICONS: Record<string, LucideIcon> = { tag: Tag, briefcase: Briefcase, heart: Heart, "book-open": BookOpen, sparkles: Sparkles, home: Home, dumbbell: Dumbbell, palette: Palette, plane: Plane, coffee: Coffee, bell: Bell, "calendar-days": CalendarDays };

export function SettingsPage({ initialData, initialSection }: { initialData: SettingsData; initialSection?: string }) {
  const clerk = useClerk();
  const [section, setSection] = useState<Section>(SECTION_ITEMS.some((item) => item.id === initialSection) ? initialSection as Section : "profile");
  const [settings, setSettings] = useState(initialData.settings);
  const [categories, setCategories] = useState(initialData.categories);
  const [scope, setScope] = useState<CategoryScope>("calendar");
  const [editing, setEditing] = useState<UserCategory | "new" | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function save(patch: SettingsPatch, success = "Preference saved.") {
    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);
    startTransition(async () => {
      try {
        const saved = await updateSettingsAction(patch);
        setSettings(saved);
        if (patch.theme) document.documentElement.dataset.theme = patch.theme;
        setMessage(success);
      } catch (error) { setSettings(settings); setMessage(error instanceof Error ? error.message : "Could not save this preference."); }
    });
  }

  async function toggleBrowser(value: boolean) {
    if (value && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    save({ notifications: { ...settings.notifications, browserReminders: value } });
  }

  const content = {
    profile: <ProfileCard data={initialData} openProfile={() => clerk.openUserProfile()} />,
    subscription: <SubscriptionCard data={initialData} />,
    categories: <CategoriesCard scope={scope} setScope={setScope} categories={categories} edit={setEditing} />,
    ai: <AiCard settings={settings} save={save} />,
    preferences: <PreferencesCard settings={settings} save={save} />,
    notifications: <NotificationsCard settings={settings} save={save} toggleBrowser={toggleBrowser} />,
    data: <DataCard />,
    privacy: <PrivacyCard openProfile={() => clerk.openUserProfile()} />,
  }[section];

  return <div className="settings-page">
    <div className="settings-intro"><div><span><Sparkles size={14} /> Your workspace, your way</span><h1>Settings</h1><p>Shape Flowspace around the way you think, plan, and create.</p></div><div className="settings-saved"><Check size={14} /> {pending ? "Saving…" : "Saved for your account"}</div></div>
    <div className="settings-mobile-nav"><select aria-label="Settings section" value={section} onChange={(event) => setSection(event.target.value as Section)}>{SECTION_ITEMS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div>
    <div className="settings-layout">
      <nav className="settings-menu" aria-label="Settings sections">{SECTION_ITEMS.map((item) => { const Icon = item.icon; return <button className={section === item.id ? "active" : ""} key={item.id} onClick={() => setSection(item.id)}><span><Icon size={15} /></span>{item.label}<ChevronRight size={13} /></button>; })}</nav>
      <div className="settings-content" key={section}>{content}</div>
    </div>
    {message && <div className="settings-toast" role="status">{message}<button aria-label="Dismiss" onClick={() => setMessage("")}><X size={13} /></button></div>}
    {editing && <CategoryDialog category={editing} scope={scope} pending={pending} close={() => setEditing(null)} submit={(value) => startTransition(async () => { try { if (editing === "new") { const created = await createCategoryAction(value); setCategories((current) => [...current, created]); } else { const updated = await updateCategoryAction(editing.id, value); setCategories((current) => current.map((entry) => entry.id === editing.id ? updated : entry)); } setEditing(null); setMessage(editing === "new" ? "Category created." : "Category updated."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save category."); } })} remove={editing === "new" ? undefined : () => startTransition(async () => { if (!window.confirm(`Delete “${editing.name}”? Assigned items will become uncategorized.`)) return; try { await deleteCategoryAction(editing.id); setCategories((current) => current.filter((entry) => entry.id !== editing.id)); setEditing(null); setMessage("Category deleted."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete category."); } })} />}
  </div>;
}

function SectionCard({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: React.ReactNode }) {
  return <Card className="settings-card"><CardHeader className="settings-card-head"><span className="settings-card-icon"><Icon size={17} /></span><div><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></div></CardHeader><CardContent className="settings-card-body">{children}</CardContent></Card>;
}

function ProfileCard({ data, openProfile }: { data: SettingsData; openProfile: () => void }) {
  const initials = data.profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <SectionCard icon={UserRound} title="Profile" description="Your personal details and account identity."><div className="settings-profile"><div className="settings-avatar">{data.profile.imageUrl ? <img src={data.profile.imageUrl} alt="" /> : initials}<i /></div><div><h2>{data.profile.name}</h2><p>{data.profile.email}</p><span>Member since {new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(data.profile.createdAt))}</span></div><Button onClick={openProfile} variant="outline"><Pencil size={14} /> Edit profile</Button></div><div className="settings-note"><ShieldCheck size={16} /><div><strong>Managed securely with Clerk</strong><span>Your identity, password, sessions, and verification methods stay in your secure account portal.</span></div></div></SectionCard>;
}

function SubscriptionCard({ data }: { data: SettingsData }) {
  return <SectionCard icon={CreditCard} title="Subscription" description="Manage your Free or Pro plan securely with Clerk."><div className="plan-card"><div><span>Plans</span><h2>Free & Pro</h2><p><i /> Free includes core planning. Pro unlocks Flowspace AI.</p></div></div><div className="usage-grid">{Object.entries(data.usage).map(([key, value]) => <div key={key}><strong>{value}</strong><span>{key === "aiApps" ? "AI apps" : key}</span></div>)}</div><PricingTable for="user" /></SectionCard>;
}

function CategoriesCard({ scope, setScope, categories, edit }: { scope: CategoryScope; setScope: (scope: CategoryScope) => void; categories: UserCategory[]; edit: (category: UserCategory | "new") => void }) {
  const visible = categories.filter((item) => item.scope === scope);
  return <SectionCard icon={Tag} title="Categories" description="Create a visual language for every part of your workspace."><div className="category-tabs">{(Object.keys(SCOPE_LABELS) as CategoryScope[]).map((item) => <button className={scope === item ? "active" : ""} onClick={() => setScope(item)} key={item}>{SCOPE_LABELS[item]}</button>)}</div><div className="settings-category-list">{visible.map((item) => { const Icon = ICONS[item.icon] ?? Tag; return <button key={item.id} onClick={() => edit(item)}><span className="category-symbol" style={{ color: item.color, background: `${item.color}18` }}><Icon size={15} /></span><span><strong>{item.name}</strong><small>{item.icon.replace("-", " ")}</small></span><Pencil size={13} /></button>; })}{!visible.length && <div className="category-empty"><Tag size={20} /><strong>No categories yet</strong><span>Add one to make {SCOPE_LABELS[scope].toLowerCase()} easier to scan.</span></div>}</div><Button className="add-category" onClick={() => edit("new")}><Plus size={14} /> Add category</Button></SectionCard>;
}

function AiCard({ settings, save }: { settings: SettingsSnapshot; save: (patch: SettingsPatch) => void }) {
  const features: Array<[keyof SettingsSnapshot["aiFeatures"], string, string]> = [["notesRefine", "AI Refine", "Rewrite and polish selected note text"], ["whiteboardDiagrams", "AI diagrams", "Turn prompts into editable whiteboards"], ["templateBuilder", "AI Template Builder", "Generate personal productivity mini apps"], ["assistant", "AI Assistant", "Show your general assistant entry point"]];
  return <div className="settings-stack"><SectionCard icon={Bot} title="AI model" description="Choose the model Flowspace uses for your AI tools."><Field label="Preferred Gemini model"><select value={settings.aiModel} onChange={(e) => save({ aiModel: e.target.value as SettingsSnapshot["aiModel"] })}>{AI_MODELS.map((model) => <option key={model} value={model}>{model === "gemini-3.1-flash-lite" ? "Gemini 3.1 Flash-Lite · Fast" : model === "gemini-3.5-flash" ? "Gemini 3.5 Flash · Recommended" : "Gemini 3.1 Pro · Preview"}</option>)}</select></Field><div className="two-fields"><Field label="Default behavior"><select value={settings.aiBehavior} onChange={(e) => save({ aiBehavior: e.target.value as SettingsSnapshot["aiBehavior"] })}>{AI_BEHAVIORS.map((value) => <option key={value} value={value}>{capitalize(value)}</option>)}</select></Field><Field label="Response tone"><select value={settings.aiTone} onChange={(e) => save({ aiTone: e.target.value as SettingsSnapshot["aiTone"] })}>{AI_TONES.map((value) => <option key={value} value={value}>{capitalize(value)}</option>)}</select></Field></div></SectionCard><SectionCard icon={Sparkles} title="AI features" description="Keep only the AI tools that help your flow."><div className="toggle-list">{features.map(([key, title, copy]) => <Toggle key={key} title={title} copy={copy} checked={settings.aiFeatures[key]} onChange={(checked) => save({ aiFeatures: { ...settings.aiFeatures, [key]: checked } })} />)}</div></SectionCard></div>;
}

function PreferencesCard({ settings, save }: { settings: SettingsSnapshot; save: (patch: SettingsPatch) => void }) {
  return <SectionCard icon={Palette} title="Preferences" description="Set comfortable defaults for everyday work."><div className="choice-group"><label>Theme</label><div className="segmented">{THEMES.map((value) => <button className={settings.theme === value ? "active" : ""} onClick={() => save({ theme: value })} key={value}>{capitalize(value)}</button>)}</div></div><div className="two-fields"><Field label="Default calendar view"><select value={settings.defaultCalendarView} onChange={(e) => save({ defaultCalendarView: e.target.value as SettingsSnapshot["defaultCalendarView"] })}>{CALENDAR_VIEWS.map((value) => <option key={value} value={value}>{capitalize(value)}</option>)}</select></Field><Field label="Default task priority"><select value={settings.defaultTaskPriority} onChange={(e) => save({ defaultTaskPriority: e.target.value as SettingsSnapshot["defaultTaskPriority"] })}>{TASK_PRIORITIES.map((value) => <option key={value} value={value}>{capitalize(value)}</option>)}</select></Field></div><div className="toggle-list spaced"><Toggle title="Auto-save editors" copy="Save Notes and Pages quietly while you work" checked={settings.autoSave} onChange={(autoSave) => save({ autoSave })} /></div></SectionCard>;
}

function NotificationsCard({ settings, save, toggleBrowser }: { settings: SettingsSnapshot; save: (patch: SettingsPatch) => void; toggleBrowser: (value: boolean) => void }) {
  const rows: Array<[keyof SettingsSnapshot["notifications"], string, string]> = [["browserReminders", "Browser reminders", "Show calendar reminders on this device"], ["dueDateAlerts", "Due-date alerts", "Highlight tasks approaching their due date"], ["commentActivity", "Comment activity", "Notify you about conversations on shared work"], ["productUpdates", "Product updates", "Occasional news about new Flowspace features"]];
  return <SectionCard icon={BellRing} title="Notifications" description="Choose the moments that deserve your attention."><div className="toggle-list">{rows.map(([key, title, copy]) => <Toggle key={key} title={title} copy={copy} checked={settings.notifications[key]} onChange={(checked) => key === "browserReminders" ? toggleBrowser(checked) : save({ notifications: { ...settings.notifications, [key]: checked } })} />)}</div></SectionCard>;
}

function DataCard() { return <SectionCard icon={Download} title="Data & export" description="Take a portable copy of the work you own."><div className="export-panel"><span><Download size={19} /></span><div><strong>Export your Flowspace data</strong><p>Download settings, categories, calendar, tasks, notes, spaces, whiteboards, and generated apps as JSON.</p></div><Button asChild><a href="/api/settings/export"><Download size={14} /> Download export</a></Button></div><div className="settings-note"><LockKeyhole size={16} /><div><strong>Private by design</strong><span>Credentials and other people’s private account data are never included.</span></div></div></SectionCard>; }
function PrivacyCard({ openProfile }: { openProfile: () => void }) { return <SectionCard icon={ShieldCheck} title="Privacy & security" description="Review sign-in security and active account sessions."><div className="privacy-grid"><button onClick={openProfile}><LockKeyhole size={17} /><span><strong>Password & authentication</strong><small>Manage password, MFA, and verification</small></span><ChevronRight size={14} /></button><button onClick={openProfile}><ShieldCheck size={17} /><span><strong>Active sessions</strong><small>Review devices and sign out remotely</small></span><ChevronRight size={14} /></button><button onClick={openProfile}><UserRound size={17} /><span><strong>Account controls</strong><small>Connected accounts and account deletion</small></span><ChevronRight size={14} /></button></div></SectionCard>; }

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="settings-field"><span>{label}</span>{children}</label>; }
function Toggle({ title, copy, checked, onChange }: { title: string; copy: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="settings-toggle"><span><strong>{title}</strong><small>{copy}</small></span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><i><b /></i></label>; }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }

function CategoryDialog({ category, scope, pending, close, submit, remove }: { category: UserCategory | "new"; scope: CategoryScope; pending: boolean; close: () => void; submit: (value: { name: string; color: string; icon: string; scope: CategoryScope }) => void; remove?: () => void }) {
  const [name, setName] = useState(category === "new" ? "" : category.name); const [color, setColor] = useState(category === "new" ? CATEGORY_COLORS[0] : category.color); const [icon, setIcon] = useState(category === "new" ? "tag" : category.icon); const [search, setSearch] = useState("");
  const choices = useMemo(() => CATEGORY_ICONS.filter((value) => value.includes(search.toLowerCase().trim())), [search]);
  return <div className="settings-modal" onMouseDown={close}><form onSubmit={(event) => { event.preventDefault(); submit({ name, color, icon, scope }); }} onMouseDown={(event) => event.stopPropagation()}><header><div><span><Tag size={16} /></span><div><h2>{category === "new" ? "New" : "Edit"} {SCOPE_LABELS[scope]} category</h2><p>Pair a clear name with a color and icon.</p></div></div><button type="button" onClick={close}><X size={17} /></button></header><div className="settings-modal-body"><Field label="Category name"><input autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Deep work" /></Field><div className="settings-field"><span>Color</span><div className="category-colors">{CATEGORY_COLORS.map((value) => <button type="button" aria-label={`Use ${value}`} className={color === value ? "active" : ""} style={{ background: value }} onClick={() => setColor(value)} key={value}>{color === value && <Check size={12} />}</button>)}</div></div><Field label="Icon"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search icons…" /></Field><div className="icon-choices">{choices.map((value) => { const Icon = ICONS[value]; return <button type="button" title={value} aria-label={`Use ${value}`} className={icon === value ? "active" : ""} onClick={() => setIcon(value)} key={value}><Icon size={16} /></button>; })}</div></div><footer>{remove && <Button type="button" variant="destructive" onClick={remove}><Trash2 size={13} /> Delete</Button>}<span /><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button disabled={pending || !name.trim()} type="submit"><Save size={13} /> Save category</Button></footer></form></div>;
}
