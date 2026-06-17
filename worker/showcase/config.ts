export const SHOWCASE_PATH = "/showcase";
export const SHOWCASE_COMMENTS_PATH = "/showcase/comments";

export type SectionType =
  | "overview"
  | "architecture"
  | "milestones"
  | "buildlog"
  | "comments";

export interface Section {
  id: string;
  type: SectionType;
  title: string;
  enabled: boolean;
  order: number;
  /**
   * Curated, AUTHOR-TRUSTED HTML fragment for prose sections (overview/architecture/
   * milestones). Rendered UNESCAPED. Only ever set from this file's static SECTIONS —
   * NEVER from user input or any external/runtime source, or it becomes an XSS sink.
   */
  bodyHtml?: string;
}

/**
 * v1 section list. Toggle/reorder by editing this file + redeploy (YAGNI: no runtime UI).
 * Curated bodyHtml is author-trusted (NOT escaped on render). buildlog + comments are
 * data-driven and rendered with escaping.
 */
export const SECTIONS: Section[] = [
  { id: "overview", type: "overview", title: "Overview", enabled: true, order: 10,
    bodyHtml: `<p>Voygent plans real, bookable trips from inside ChatGPT and Claude. An advisor
describes a trip in plain language and gets back live fares, real supplier-portal rates, and a
client-ready proposal, with commission visible on every result before the quote goes out.</p>
<p>What it searches against:</p>
<ul>
  <li><span class="stat">51</span> cruise lines, <span class="stat">8</span> of them direct</li>
  <li><span class="stat">466+</span> all-inclusive resorts, commission shown inline (typically
      <span class="stat">18&ndash;22%</span>)</li>
  <li><span class="stat">8</span> flight sources, including consolidator and net fares with
      <span class="stat">48-hour</span> commission-protected holds</li>
  <li>Tours, transfers, car rental and travel insurance, each tagged with the advisor's own
      affiliate codes</li>
</ul>
<p>This page follows the build in the open. The log below updates as features ship, and the
comments at the bottom are open and read by a human.</p>
<a class="cta" href="/">Watch it plan a real trip &rarr;</a>` },
  { id: "architecture", type: "architecture", title: "Architecture", enabled: true, order: 20,
    bodyHtml: `<p>Voygent is a single Cloudflare Worker exposing a Model Context Protocol (MCP)
server. There is no app to install. Advisors reach it through the connectors already built into
ChatGPT and Claude, on desktop, web, and mobile, voice included.</p>
<p>A few decisions worth calling out:</p>
<ul>
  <li><strong>One Worker, many suppliers.</strong> Around 70 supplier tools are consolidated into
      roughly 30 per-domain routers so the whole catalog fits inside ChatGPT's ~35-tool ceiling.</li>
  <li><strong>Multi-tenant from day one.</strong> Per-user URL plus HMAC-hashed token auth, each
      advisor on their own subdomain with isolated trips.</li>
  <li><strong>Structured trip state.</strong> Every trip is a typed state machine of days, bookings,
      travelers, and documents, addressable down to a single field, with consistency checks on every
      save.</li>
  <li><strong>Cloud-browser fallback for the hard suppliers.</strong> Most portals are reachable
      directly from the Worker. A few (Carnival-class, behind Akamai bot management at the connection
      layer) are not, and route through a cloud browser instead.</li>
</ul>
<p>It does not book anything for you. The advisor still confirms in the supplier portal; Voygent is
a power tool, not an autopilot.</p>
<a class="cta" href="/info/production-system">Read the engineering notes &rarr;</a>` },
  { id: "milestones", type: "milestones", title: "Milestones", enabled: true, order: 30,
    bodyHtml: `<p>Voygent started as a way to cut proposal build time from hours to about a minute.
It has grown into a full advisor workspace.</p>
<p>Where the build is now:</p>
<ul>
  <li><strong>Search across every domain</strong> &mdash; cruise, flight, hotel, all-inclusive, tour,
      transfer, car, insurance &mdash; live and commission-aware.</li>
  <li><strong>In-chat trip proposals.</strong> A live proposal renders inside the chat: day-by-day
      timeline, per-segment flights, budget depth, hero image, packing list, and more. Advisors edit
      it in place and pick options without leaving the conversation.</li>
  <li><strong>Commission front and center.</strong> A decision-aware commission board lets advisors
      see and set their margin per option as they build.</li>
  <li><strong>Built to be trusted.</strong> A per-user credential vault, a Free/Pro/Agency tier model,
      and a security regression suite that gates every production deploy.</li>
</ul>
<p>What's next: bringing the full client-facing trip page inline into chat (and retiring the separate
browser page), richer place and map data, and deeper profit tooling.</p>
<a class="cta" href="/blog">Read the build notes &rarr;</a>` },
  { id: "buildlog", type: "buildlog", title: "Build log", enabled: true, order: 40 },
  { id: "comments", type: "comments", title: "Comments", enabled: true, order: 50 },
];

export const KNOWN_SECTION_IDS: ReadonlySet<string> = new Set(SECTIONS.map((s) => s.id));

export function enabledSections(sections: Section[]): Section[] {
  return sections.filter((s) => s.enabled).slice().sort((a, b) => a.order - b.order);
}
