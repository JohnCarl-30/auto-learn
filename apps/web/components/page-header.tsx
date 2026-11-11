import { cn } from '@/lib/utils';

/**
 * A small mono eyebrow naming the section, then the page's one-line promise.
 * `display` is the opening size, for a page with nothing on it yet but the box.
 */
export function PageHeader({
  eyebrow,
  title,
  display = false,
}: {
  eyebrow: string;
  title: string;
  display?: boolean;
}) {
  return (
    <div className="mb-10">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.08em] text-cobalt">{eyebrow}</p>
      <h1
        className={cn(
          'font-display font-semibold tracking-tight',
          display ? 'max-w-2xl text-4xl sm:text-display' : 'text-2xl sm:text-3xl',
        )}
      >
        {title}
      </h1>
    </div>
  );
}
