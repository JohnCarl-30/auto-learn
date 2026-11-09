/** A small mono eyebrow naming the section, then the page's one-line promise. */
export function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-10">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.08em] text-cobalt">{eyebrow}</p>
      <h1 className="max-w-prose font-display text-3xl leading-tight tracking-tight sm:text-4xl">
        {title}
      </h1>
    </div>
  );
}
