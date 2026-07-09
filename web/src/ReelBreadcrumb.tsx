// web/src/ReelBreadcrumb.tsx
// N13/N14: a slim, always-visible chapter breadcrumb in the reel's margin — where the
// viewer is in the 3-chapter arc, with the other chapters one click away. Replaces the
// modal as the way to move between chapters mid-flow.
export function ReelBreadcrumb({ chapters, currentId, onChapter }: {
  chapters: { id: string; title: string; chapter: number }[];
  currentId: string;
  onChapter: (id: string) => void;
}) {
  const cur = chapters.find((c) => c.id === currentId);
  if (!cur || chapters.length < 2) return null;
  return (
    <nav className="cl-reel-crumb" aria-label="Demo chapters">
      {chapters.map((c) => {
        const state = c.chapter < cur.chapter ? "done" : c.id === currentId ? "on" : "todo";
        const short = c.title.replace(/^Chapter \d+ · /, "");
        return c.id === currentId
          ? <span key={c.id} className={`cl-reel-crumb-c ${state}`} aria-current="step"><b>{c.chapter}</b> {short}</span>
          : (
            <button key={c.id} type="button" className={`cl-reel-crumb-c ${state}`} onClick={() => onChapter(c.id)}>
              <b>{state === "done" ? "✓" : c.chapter}</b> {short}
            </button>
          );
      })}
    </nav>
  );
}
