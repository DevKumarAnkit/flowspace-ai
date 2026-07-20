"use client";

import Link from "next/link";
import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  ArrowRight, Bot, BrainCircuit, CalendarDays, Check, ChevronDown, CircleDot,
  Columns3, FileText, LayoutDashboard, Menu, MessageSquareText, Network,
  Palette, Play, Plus, Sparkles, Star, Users, WandSparkles, X, Zap,
} from "lucide-react";
import styles from "./landing-page.module.css";

const features = [
  [Bot, "AI Assistant", "Turn a thought into an action plan, draft, or answer in seconds.", "violet"],
  [LayoutDashboard, "Smart Dashboard", "A calm command center that surfaces the work that matters now.", "blue"],
  [CalendarDays, "Calendar & Reminders", "See your time clearly and never let an important follow-up slip.", "orange"],
  [Columns3, "Kanban Boards", "Plan projects visually with flexible boards that move with your team.", "pink"],
  [FileText, "Beautiful Notes", "Capture knowledge in a focused, Notion-style editor built for momentum.", "green"],
  [Palette, "Infinite Whiteboard", "Think out loud with a spacious canvas for diagrams, ideas, and workshops.", "cyan"],
  [WandSparkles, "AI Template Builder", "Describe a workflow and let Flowspace shape the first version for you.", "yellow"],
  [Users, "Live Collaboration", "Create together with shared presence, comments, and instant updates.", "rose"],
  [CircleDot, "Your Workspace", "Make Flowspace yours with custom categories, views, and preferences.", "indigo"],
] as const;

const featureRoutes: Record<(typeof features)[number][1], string> = {
  "AI Assistant": "/assistant",
  "Smart Dashboard": "/",
  "Calendar & Reminders": "/calendar",
  "Kanban Boards": "/kanban",
  "Beautiful Notes": "/notes",
  "Infinite Whiteboard": "/whiteboard",
  "AI Template Builder": "/ai-template-builder",
  "Live Collaboration": "/spaces",
  "Your Workspace": "/settings",
};

const faqs = [
  ["What can the AI Assistant help with?", "It can draft notes, turn ideas into tasks, refine writing, plan projects, and help you discover the next best action in your workspace."],
  ["Can my team collaborate in real time?", "Yes. Shared boards, pages, comments, and live presence let your team work together without waiting for a refresh."],
  ["Are notes and whiteboards included?", "Absolutely. Flowspace brings rich notes, visual whiteboards, task boards, and calendar planning into one connected workspace."],
  ["What is the AI Template Builder?", "It helps you rapidly create tailored workspace templates and small internal tools from a simple natural-language prompt."],
  ["How is my data protected?", "Your workspace is private by default. We use secure infrastructure and give you control over your members, spaces, and shared content."],
];

function Brand() {
  return <Link href="/" className={styles.brand}><span><Sparkles size={17} /></span>flowspace</Link>;
}

export function LandingPage() {
  const { isSignedIn } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const getStartedHref = isSignedIn ? "/dashboard" : "/sign-in";
  return <main className={styles.page}>
    <nav className={styles.nav}>
      <Brand />
      <div className={`${styles.navLinks} ${menuOpen ? styles.open : ""}`}>
        <a href="#product" onClick={() => setMenuOpen(false)}>Product</a><a href="#ai" onClick={() => setMenuOpen(false)}>AI workspace</a><a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a><a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
      </div>
      <div className={styles.navActions}><Link href="/sign-in" className={styles.signIn}>Sign in</Link><Link href={getStartedHref} className={styles.navCta}>Get started <ArrowRight size={15} /></Link></div>
      <button className={styles.menuButton} aria-label="Toggle menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
    </nav>

    <section className={styles.hero}>
      <div className={styles.heroGlow} /><div className={styles.heroGlowTwo} />
      <div className={styles.eyebrow}><Sparkles size={14} /> The intelligent way to work</div>
      <h1>Your entire workday,<br /><em>beautifully in flow.</em></h1>
      <p>Flowspace is the AI-powered workspace for notes, tasks, whiteboards, and team collaboration—designed to make ambitious work feel effortless.</p>
      <div className={styles.heroButtons}><Link href={getStartedHref} className={styles.primaryButton}>Get started for free <ArrowRight size={17} /></Link><Link href={getStartedHref} className={styles.secondaryButton}><Play size={15} fill="currentColor" /> Watch demo</Link></div>
      <div className={styles.trustRow}><span><Bot size={15} /> AI Assistant</span><span><Users size={15} /> Real-time collaboration</span><span><Zap size={15} /> Smart workspace</span></div>
      <DashboardMockup />
    </section>

    <section className={styles.logoBar}><span>Built for clarity. Loved by modern teams.</span><div><b>ARC</b><b>orbit</b><b>northstar</b><b>VERVE</b><b>huddle</b></div></section>

    <SectionIntro eyebrow="Everything connected" title="One calm place for every kind of work." copy="Replace the patchwork of tools with a workspace that understands how your ideas, plans, and people move together." />
    <section className={styles.featureSection} id="features"><div className={styles.featureGrid}>{features.map(([Icon, title, description, color]) => <Link href={featureRoutes[title]} className={`${styles.featureCard} ${styles[color]}`} key={title}><span className={styles.featureIcon}><Icon size={22} /></span><h3>{title}</h3><p>{description}</p><ArrowRight className={styles.cardArrow} size={17} /></Link>)}</div></section>

    <section className={styles.steps}><div className={styles.stepsIntro}><div className={styles.eyebrow}>A better work rhythm</div><h2>From scattered to<br /><em>in sync.</em></h2><p>Flowspace is designed around the natural arc of meaningful work.</p></div><div className={styles.stepList}>{[["01", "Organize your workspace", "Bring notes, projects, meetings, and ideas into a system that feels like yours."], ["02", "Let AI plan and create", "Move past the blank page with an assistant that understands context and momentum."], ["03", "Collaborate and progress", "Keep everyone aligned with live updates, thoughtful comments, and clear next steps."]].map(([number,title,copy]) => <article className={styles.step} key={number}><b>{number}</b><div><h3>{title}</h3><p>{copy}</p></div><ArrowRight size={20} /></article>)}</div></section>

    <section className={styles.showcase} id="product"><SectionIntro eyebrow="A workspace that adapts" title="See the big picture. Then make it happen." copy="Every view is intentionally connected, so moving from a spark of an idea to a finished project takes less effort." /><div className={styles.showcaseGrid}><ShowcaseCard kind="dashboard" href="/" title="A dashboard with perspective" copy="Your plans, priorities, and progress—gently brought into focus." /><ShowcaseCard kind="notes" href="/notes" title="Notes that lead somewhere" copy="Capture the detail, connect the dots, and turn insight into action." /><ShowcaseCard kind="board" href="/kanban" title="Projects in motion" copy="Make every handoff and next step visible to your team." /><ShowcaseCard kind="canvas" href="/whiteboard" title="Space to think visually" copy="Map ideas, sketch systems, and make complexity easier to see." /></div></section>

    <section className={styles.aiSection} id="ai"><div className={styles.aiVisual}><div className={styles.aiOrb}><BrainCircuit size={42} /></div><div className={styles.chatBubble}><span>Flow AI</span><b>What would you like to move forward?</b><div><i /> Draft a project plan for the launch</div></div><div className={styles.aiTag}>Weekly focus <strong>+24%</strong></div></div><div className={styles.aiCopy}><div className={styles.eyebrow}><Sparkles size={14} /> Intelligence, thoughtfully applied</div><h2>Your most capable<br /><em>teammate lives here.</em></h2><p>Use natural language to remove the busywork between an idea and a finished outcome.</p><ul>{["Turn rough ideas into actionable tasks", "Create calendar reminders in one sentence", "Refine notes without losing your voice", "Generate diagrams, templates, and mini apps", "Uncover your productivity patterns"].map(item => <li key={item}><Check size={16} />{item}</li>)}</ul><Link href="/log-in" className={styles.textLink}>Meet Flow AI <ArrowRight size={16} /></Link></div></section>

    <section className={styles.collaboration}><div><div className={styles.eyebrow}>Made for shared momentum</div><h2>Work together,<br /><em>without the waiting.</em></h2><p>Bring the whole team into a shared, living workspace. See who is active, leave context where it belongs, and keep every decision moving.</p><div className={styles.collabPoints}><span><Check size={15} /> Shared Kanban boards</span><span><Check size={15} /> Live user presence</span><span><Check size={15} /> Contextual comments</span><span><Check size={15} /> Liveblocks-powered</span></div></div><CollaborationMockup /></section>

    <section className={styles.useCases}><SectionIntro eyebrow="Built around your work" title="A thoughtful system for every ambition." copy="One flexible workspace, shaped around the way you work best." /><div className={styles.useCaseGrid}>{[["For founders", "Keep your vision, roadmap, and team aligned."], ["For students", "Turn learning into a system you can build on."], ["For teams", "Create a shared source of truth that stays current."], ["For creators", "Give your best ideas room to become something real."], ["For project managers", "See every moving part without losing the human context."], ["For personal growth", "Make space for the goals that matter most."]].map(([title, copy], index) => <article key={title}><span>{["✦", "◌", "↗", "✳", "⌘", "☼"][index]}</span><h3>{title}</h3><p>{copy}</p><ArrowRight size={16} /></article>)}</div></section>

    <section className={styles.pricing} id="pricing"><SectionIntro eyebrow="Simple, transparent pricing" title="Everything you need to find your flow." copy="Start free, then unlock the complete Flowspace workspace for just $2 a month." /><div className={styles.pricingGrid}>{[["Free", "$0", "A focused personal workspace", ["Personal dashboard and notes", "Kanban task boards", "Calendar and reminders", "One workspace to get started"], "Start for free"], ["Pro", "$2", "The complete Flowspace experience", ["Everything in Free", "Flow AI Assistant", "Whiteboards and diagram generation", "AI Template Builder", "Live collaboration and comments", "Custom categories and settings"], "Go Pro"]].map(([name, price, subline, items, button], index) => <article className={index === 1 ? styles.featuredPrice : ""} key={String(name)}>{index === 1 && <span className={styles.popular}>Best value</span>}<h3>{name}</h3><p>{subline}</p><strong><small>$</small>{price.slice(1)}<i>/ month</i></strong><ul>{(items as string[]).map(item => <li key={item}><Check size={15} />{item}</li>)}</ul><Link href={index === 1 ? "/checkout" : getStartedHref} className={index === 1 ? styles.primaryButton : styles.planButton}>{button}<ArrowRight size={15} /></Link></article>)}</div></section>

    <section className={styles.testimonials}><SectionIntro eyebrow="Loved by thoughtful teams" title="A better way to make progress." copy="A few words from people building their best work with Flowspace." /><div className={styles.testimonialGrid}>{[["Flowspace brought a sense of quiet to our busiest work. The AI feels like a genuinely helpful extra teammate.", "Maya Chen", "Co-founder, Outline Studio", "MC"], ["We replaced four tools with one workspace our whole team actually enjoys opening every morning.", "James Okafor", "Head of Product, Loomly", "JO"], ["The whiteboard and notes connection changed how I think through projects. It is remarkably well considered.", "Elena Rossi", "Independent Creative Director", "ER"]].map(([quote, name, role, initials]) => <article key={name}><div className={styles.stars}>{Array.from({length:5}).map((_,i)=><Star key={i} size={14} fill="currentColor" />)}</div><blockquote>“{quote}”</blockquote><footer><span>{initials}</span><div><b>{name}</b><small>{role}</small></div></footer></article>)}</div></section>

    <section className={styles.faq} id="faq"><SectionIntro eyebrow="Questions, answered" title="Everything you need to know." copy="Can’t find what you are looking for? We are always happy to help." /><div className={styles.faqList}>{faqs.map(([question, answer], index) => <article key={question}><button onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}><span>{question}</span><ChevronDown className={openFaq === index ? styles.rotated : ""} size={20} /></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>

    <section className={styles.finalCta}><div className={styles.finalGlow} /><div className={styles.eyebrow}><Sparkles size={14} /> Make room for your best work</div><h2>Build your entire productivity<br />system in one <em>AI workspace.</em></h2><p>Start with a clearer day. No credit card required.</p><Link href={getStartedHref} className={styles.primaryButton}>Start for free <ArrowRight size={17} /></Link></section>
    <footer className={styles.footer}><Brand /><p>Work that feels like it flows.</p><div className={styles.footerLinks}><span>Product</span><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#ai">AI workspace</a><span>Resources</span><a href="#faq">Help center</a><Link href="/log-in">Get started</Link></div><div className={styles.footerBottom}><small>© 2026 Flowspace. All rights reserved.<br />Developed by Ankit Kumar · 2024UGEC085</small><div><Link href="/settings">Privacy</Link><Link href="/settings">Terms</Link><Link href="/settings">Security</Link></div></div></footer>
  </main>;
}

function SectionIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <div className={styles.sectionIntro}><div className={styles.eyebrow}>{eyebrow}</div><h2>{title}</h2><p>{copy}</p></div>; }

function DashboardMockup() { return <div className={styles.dashboardMockup}><div className={styles.mockSidebar}><span><Sparkles size={14}/></span><i /><i /><i /><i /></div><div className={styles.mockMain}><header><div><b>Good morning, Maya</b><small>Here is your workspace at a glance.</small></div><span>MC</span></header><div className={styles.mockTop}><article><small>FOCUS SCORE</small><b>78<span>%</span></b><em>↑ 12% this week</em></article><article><small>UP NEXT</small><b>Product review</b><em><i /> Today, 2:00 PM</em></article><article><small>TEAM PULSE</small><b>8 teammates</b><em>● 5 active now</em></article></div><div className={styles.mockContent}><article><header><b>Today’s priorities</b><small>View all</small></header>{["Shape Q3 product narrative", "Review onboarding flow", "Team design critique"].map((task, i) => <div key={task}><i className={i===1 ? styles.checked : ""}>{i===1 && <Check size={10}/>}</i><span>{task}</span><small>{i===0 ? "Strategy" : i===1 ? "Design" : "Team"}</small></div>)}</article><article className={styles.mockKanban}><header><b>Launch planning</b><small>•••</small></header><div><span><i />Research</span><span><i />In progress</span><span><i />Ready</span></div><section><b>Audience insights</b><small>AK · Today</small></section><section><b>Launch assets</b><small>MC · Jul 12</small></section></article></div></div></div> }

function ShowcaseCard({kind, href, title, copy}:{kind:string;href:string;title:string;copy:string}) { return <article className={`${styles.showcaseCard} ${styles[kind]}`}><div className={styles.showVisual}>{kind === "notes" ? <><b>Project Northstar</b><i /><strong>The direction is clear. Now we make it real.</strong><p>Ideas, decisions, and the next chapter—all in one place.</p></> : kind === "board" ? <><span>To do</span><span>In progress</span><span>Done</span><i>Research</i><i>Design</i><i>Launch plan</i></> : kind === "canvas" ? <><b>Customer journey</b><span>Discover</span><span>Decide</span><span>Delight</span><i /><i /><i /></> : <><header><span>Overview</span><b>This week</b></header><div><i /><i /><i /></div><section><b>12</b><span>tasks completed</span></section></>}</div><div className={styles.showCopy}><h3>{title}</h3><p>{copy}</p><Link href={href} aria-label={`Open ${title}`}><ArrowRight size={17} /></Link></div></article> }

function CollaborationMockup() { return <div className={styles.collabMockup}><header><span>Product sprint</span><div><i>MC</i><i>JK</i><i>AR</i><b>+3</b></div></header><div className={styles.collabColumns}>{["Ideas", "In progress", "Ready"].map((col, i)=><section key={col}><b>{col}<small>{i+2}</small></b><article className={i===1 ? styles.activeCard : ""}><span className={styles.cardAccent}/><strong>{["Explore onboarding", "Design new empty states", "Share with the team"][i]}</strong><small>{i===1 ? "Maya is editing" : "2 comments"}</small>{i===1 && <div className={styles.cursor}>Maya</div>}</article>{i !== 2 && <article><strong>{["Find user quotes", "Review visual system"][i]}</strong><small>Tomorrow</small></article>}</section>)}</div></div> }
