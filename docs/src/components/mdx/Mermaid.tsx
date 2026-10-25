'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';

type MermaidProps = Readonly<{ chart: string }>;

const isDarkMode = () => document.documentElement.classList.contains('dark');

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

/** Renders a Mermaid diagram in the browser and follows the site's light/dark theme. */
export function Mermaid({ chart }: MermaidProps) {
  const id = useId().replaceAll(':', '');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const dark = useSyncExternalStore(subscribeToTheme, isDarkMode, () => false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: dark ? 'dark' : 'default',
        });
        const result = await mermaid.render(`mermaid-${id}`, chart);
        if (!cancelled) {
          setSvg(result.svg);
          setError('');
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, dark, id]);

  if (error) {
    return <pre className="my-4 text-sm text-red-600">Mermaid error: {error}</pre>;
  }
  return (
    <div
      className="my-4 flex justify-center overflow-x-auto"
      role="img"
      aria-label="Diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
