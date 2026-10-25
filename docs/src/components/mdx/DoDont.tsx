import type { ReactNode } from 'react';

type SideProps = Readonly<{
  /** Why this is wrong or right. */
  reason?: string;
  /** A fenced code block. */
  children: ReactNode;
}>;

function Side({ tone, label, reason, children }: SideProps & Readonly<{ tone: string; label: string }>) {
  return (
    <div className={`min-w-0 rounded-xl border-2 p-3 ${tone}`}>
      <p className="m-0 mb-2 text-sm font-semibold">{label}</p>
      {children}
      {reason && <p className="m-0 mt-2 text-sm text-fd-muted-foreground">{reason}</p>}
    </div>
  );
}

/** The wrong example. Put a fenced code block inside. */
export function Dont(props: SideProps) {
  return <Side tone="border-red-500/50" label="❌ Don't" {...props} />;
}

/** The right example. Put a fenced code block inside. */
export function Do(props: SideProps) {
  return <Side tone="border-green-500/50" label="✅ Do" {...props} />;
}

/** Side-by-side wrong and right examples: `<DoDont><Dont>…</Dont><Do>…</Do></DoDont>`. */
export function DoDont({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="my-4 grid gap-4 md:grid-cols-2">{children}</div>;
}
