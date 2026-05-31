// The authored homepage product tour — the narrative the capture harness walks and
// the DemoPlayer plays back. Each scene names a route, a caption, the selectors to
// spotlight, and where the scripted cursor moves. capture.spec.ts resolves the
// selectors to pixel rects and writes public/demo/manifest.json; missing optional
// selectors are skipped, never fatal, so the tour survives UI churn.
//
// `path` may interpolate seed ids via the ctx passed in (see .seed-context.json).

export interface SeedCtx {
  primaryAudienceId: string;
  draftCampaignId: string;
  segmentId?: string;
  automationId?: string;
}

export interface Spotlight {
  sel: string; // CSS selector resolved to a rect; skipped if absent
  label?: string; // optional tag drawn by the ring
}

export interface CursorStep {
  sel?: string; // resolved to the element center
  x?: number; // or explicit CSS-px coords
  y?: number;
  t: number; // ms from scene start
  click?: boolean;
}

export interface Scene {
  id: string;
  chapter: string;
  title: string;
  caption: string;
  path: (ctx: SeedCtx) => string;
  ready: string; // selector awaited before the shot (page is loaded)
  hold: number; // ms the scene plays
  spotlights?: Spotlight[];
  cursor?: CursorStep[];
  kenburns?: { scaleFrom: number; scaleTo: number; panTo: [number, number] };
}

export const CHAPTERS = [
  { id: "overview", label: "Overview" },
  { id: "audience", label: "Audience" },
  { id: "design", label: "Design" },
  { id: "measure", label: "Measure" },
  { id: "automate", label: "Automate" },
];

export const SCENES: Scene[] = [
  {
    id: "dashboard",
    chapter: "overview",
    title: "Your command center",
    caption: "Campaigns, subscribers, and revenue — the whole picture on one screen.",
    path: () => "/app/dashboard",
    ready: "h1",
    hold: 3600,
    spotlights: [
      { sel: ".dash-kpis", label: "Live metrics" },
      { sel: ".onboard", label: "Guided setup" },
    ],
    cursor: [{ x: 720, y: 300, t: 400 }, { sel: ".dash-kpis", t: 1400 }],
    kenburns: { scaleFrom: 1.0, scaleTo: 1.06, panTo: [-30, -18] },
  },
  {
    id: "audiences",
    chapter: "audience",
    title: "Build your audience",
    caption: "Group subscribers into lists — each one a card you can grow and segment.",
    path: () => "/app/audiences",
    ready: "h1",
    hold: 3200,
    spotlights: [{ sel: ".aud-grid", label: "Your lists" }],
    cursor: [{ sel: "button:has-text('New audience')", t: 700, click: true }],
    kenburns: { scaleFrom: 1.0, scaleTo: 1.05, panTo: [0, -20] },
  },
  {
    id: "contacts",
    chapter: "audience",
    title: "Every contact, organized",
    caption: "Search, filter, and tag a full contact table — import a CSV in seconds.",
    path: (c) => `/app/audiences/${c.primaryAudienceId}`,
    ready: "h1",
    hold: 3600,
    spotlights: [
      { sel: ".ad-toolbar", label: "Search & filter" },
      { sel: "button:has-text('Import CSV')", label: "One-click import" },
    ],
    cursor: [{ sel: ".ad-search, input[type='search']", t: 600 }, { sel: "button:has-text('Import CSV')", t: 1800, click: true }],
  },
  {
    id: "editor",
    chapter: "design",
    title: "Design without code",
    caption: "Drag blocks onto the canvas and edit in place — a real email, no HTML.",
    path: (c) => `/app/campaigns/${c.draftCampaignId}/edit`,
    ready: ".email-preview, .editor-canvas, [class*='canvas']",
    hold: 4200,
    spotlights: [
      { sel: "[class*='library'], [class*='palette']", label: "Block library" },
      { sel: "[class*='inspector'], aside", label: "Edit properties" },
    ],
    cursor: [{ x: 180, y: 360, t: 500 }, { x: 720, y: 420, t: 1600 }, { x: 1180, y: 380, t: 2800 }],
    kenburns: { scaleFrom: 1.0, scaleTo: 1.04, panTo: [0, 0] },
  },
  {
    id: "reports",
    chapter: "measure",
    title: "See what's working",
    caption: "Opens, clicks, bounces, and trends — updated as every send lands.",
    path: () => "/app/reports",
    ready: "h1",
    hold: 3600,
    spotlights: [{ sel: ".rep-kpis, [class*='kpi']", label: "Engagement at a glance" }],
    cursor: [{ sel: ".rep-kpis, [class*='kpi']", t: 800 }],
    kenburns: { scaleFrom: 1.0, scaleTo: 1.06, panTo: [-20, -24] },
  },
  {
    id: "revenue",
    chapter: "measure",
    title: "Tie email to revenue",
    caption: "Attributed revenue, orders, and AOV — prove what email is really worth.",
    path: () => "/app/reports/revenue",
    ready: "h1",
    hold: 3400,
    spotlights: [{ sel: ".rev-kpis, [class*='kpi']", label: "Revenue, attributed" }],
    cursor: [{ sel: ".rev-kpis, [class*='kpi']", t: 800 }],
  },
  {
    id: "segments",
    chapter: "audience",
    title: "Target the right people",
    caption: "Compose rules and watch the matching count update live as you build.",
    path: (c) => (c.segmentId ? `/app/segments/${c.segmentId}` : "/app/segments"),
    ready: "h1",
    hold: 3800,
    spotlights: [{ sel: ".se-preview, .se-count", label: "Live match count" }],
    cursor: [{ x: 380, y: 360, t: 500 }, { x: 620, y: 430, t: 1600 }, { sel: ".se-count, .se-preview", t: 2700 }],
  },
  {
    id: "automations",
    chapter: "automate",
    title: "Put it on autopilot",
    caption: "Welcome series, win-backs, drip flows — trigger once, run forever.",
    path: (c) => (c.automationId ? `/app/automations/${c.automationId}` : "/app/automations"),
    ready: "h1",
    hold: 3600,
    spotlights: [{ sel: ".bu-canvas, [class*='flow'], [class*='step']", label: "Multi-step flows" }],
    cursor: [{ x: 560, y: 420, t: 800 }],
    kenburns: { scaleFrom: 1.0, scaleTo: 1.05, panTo: [0, -30] },
  },
  {
    id: "templates",
    chapter: "design",
    title: "Start from a template",
    caption: "Dozens of polished, on-brand starting points — or build from blank.",
    path: () => "/app/templates",
    ready: "h1",
    hold: 3200,
    spotlights: [{ sel: "[class*='grid'], [class*='gallery']", label: "Ready-to-send designs" }],
    cursor: [{ x: 700, y: 380, t: 700 }],
  },
];
