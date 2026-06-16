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
  /** Curated, TRUSTED HTML fragment for prose sections (overview/architecture/milestones). */
  bodyHtml?: string;
}

/**
 * v1 section list. Toggle/reorder by editing this file + redeploy (YAGNI: no runtime UI).
 * Curated bodyHtml is author-trusted (NOT escaped on render). buildlog + comments are
 * data-driven and rendered with escaping.
 */
export const SECTIONS: Section[] = [
  { id: "overview", type: "overview", title: "Overview", enabled: true, order: 10,
    bodyHtml: "<p>Placeholder overview — curated copy added during content authoring.</p>" },
  { id: "architecture", type: "architecture", title: "Architecture", enabled: false, order: 20,
    bodyHtml: "<p>Placeholder architecture section.</p>" },
  { id: "milestones", type: "milestones", title: "Milestones", enabled: false, order: 30,
    bodyHtml: "<p>Placeholder milestones section.</p>" },
  { id: "buildlog", type: "buildlog", title: "Build log", enabled: true, order: 40 },
  { id: "comments", type: "comments", title: "Comments", enabled: true, order: 50 },
];

export const KNOWN_SECTION_IDS: ReadonlySet<string> = new Set(SECTIONS.map((s) => s.id));

export function enabledSections(sections: Section[]): Section[] {
  return sections.filter((s) => s.enabled).slice().sort((a, b) => a.order - b.order);
}
