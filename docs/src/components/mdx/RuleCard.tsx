import type { ReactNode } from 'react';

type Severity = 'error' | 'warn' | 'off';

const SEVERITY_STYLE: Record<Severity, string> = {
  error: 'bg-red-500/15 text-red-700 dark:text-red-300',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  off: 'bg-fd-muted text-fd-muted-foreground',
};

type RuleCardProps = Readonly<{
  /** The rule id, e.g. `boundaries/dependencies`. */
  name: string;
  severity: Severity;
  /** Link to the rule's own documentation. */
  href?: string;
  description?: string;
  /** Examples, usually a `DoDont`. */
  children?: ReactNode;
}>;

/** One lint rule: name, severity badge, link, description and examples. */
export function RuleCard({ name, severity, href, description, children }: RuleCardProps) {
  return (
    <section className="my-4 rounded-xl border bg-fd-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <code className="text-sm font-semibold">{name}</code>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLE[severity]}`}>
          {severity}
        </span>
        {href && (
          <a href={href} className="ms-auto text-xs text-fd-primary underline" target="_blank" rel="noreferrer">
            Rule docs
          </a>
        )}
      </header>
      {description && <p className="mb-0 mt-2 text-sm">{description}</p>}
      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}
