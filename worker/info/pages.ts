// Info/brag page content (task 7). Blog-style narratives grounded in real
// artifacts from the production Voygent repos — every claim names its source.
// The live numbers live in the demo's Engineering tab; these pages carry the
// stories that used to crowd it (task 6c moved the tier table / BTS cards /
// business case here).
//
// Page CONTENT now lives in ./content.json — regenerable from the live D1
// overrides (the in-place editor) via `scripts/info-content.mjs pull`, so git
// stays the source of truth. The "resume" body originated as RESUME_BODY in
// ./resume.ts; it was folded into content.json (see git history for the prior
// hand-authored form).
import { renderInfoPage } from "./layout";
import { editorChrome } from "./editor";
import type { PageOverride } from "./overrides";
import CONTENT from "./content.json";

interface InfoPage { title: string; subtitle?: string; body: string }

export interface PageData { title: string; subtitle: string; body: string }

export const PAGES: Record<string, InfoPage> = CONTENT as Record<string, InfoPage>;

/** True for slugs that have a seeded page (the only editable slugs). */
export function isKnownSlug(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(PAGES, slug);
}

/** The source-default content for a slug, or null if there's no such page. */
export function getPageData(slug: string): PageData | null {
  const page = PAGES[slug];
  if (!page) return null;
  return { title: page.title, subtitle: page.subtitle ?? "", body: page.body };
}

/** Layer a D1 override over the source default — any non-null override field wins. */
export function mergeOverride(def: PageData, ov: PageOverride | null): PageData {
  if (!ov) return def;
  return {
    title: ov.title ?? def.title,
    subtitle: ov.subtitle ?? def.subtitle,
    body: ov.body ?? def.body,
  };
}

/**
 * Render a page from resolved data. `withEditor` injects the (inert until a key
 * is stored) admin editor chrome; the live /info route passes it on every GET,
 * while back-compat callers/tests omit it.
 */
export function renderInfo(slug: string, data: PageData, opts: { withEditor?: boolean; edited?: boolean } = {}): string {
  const editorHtml = opts.withEditor ? editorChrome(slug, !!opts.edited) : "";
  return renderInfoPage({ title: data.title, subtitle: data.subtitle }, data.body, slug, editorHtml);
}

/** Back-compat: render the source-default page (no override, no editor). */
export function infoPageHtml(slug: string): string | null {
  const data = getPageData(slug);
  if (!data) return null;
  return renderInfo(slug, data);
}
