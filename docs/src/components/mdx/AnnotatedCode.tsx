import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { ServerCodeBlock, type ServerCodeBlockProps } from 'fumadocs-ui/components/codeblock.rsc';
import { languageFor, parseHighlight, readRepoCode, getRepoRoot } from '@/lib/regions';

type NoteProps = Readonly<{
  /** 1-based line of the displayed code (the region, when one is given) the note refers to. */
  line: number;
  children: ReactNode;
}>;

/** Marker component: `AnnotatedCode` reads its props, it renders nothing by itself. */
export function Note(_props: NoteProps): null {
  return null;
}

type AnnotatedCodeProps = Readonly<{
  /** Path relative to the repo root, e.g. `template/src/config/env.ts`. */
  file: string;
  /** Name of a `#region` in the file. Without it the whole file is shown. */
  region?: string;
  /** Lines to highlight, e.g. `"1,3-5"`. */
  highlight?: string;
  title?: string;
  children?: ReactNode;
}>;

function isNote(child: ReactNode): child is ReactElement<NoteProps> {
  return isValidElement(child) && child.type === Note;
}

/**
 * Shows real repo code, read at build time. Throws (and so fails `next build`) when the file or
 * the region does not exist, so the docs can never quote code that is gone.
 */
export async function AnnotatedCode({ file, region, highlight, title, children }: AnnotatedCodeProps) {
  const code = readRepoCode(file, region, getRepoRoot());
  const lineCount = code.split('\n').length;
  const notes = Children.toArray(children)
    .filter(isNote)
    .map((child) => child.props)
    .sort((a, b) => a.line - b.line);

  for (const note of notes) {
    if (!Number.isInteger(note.line) || note.line < 1 || note.line > lineCount) {
      throw new Error(`AnnotatedCode: <Note line={${note.line}}> is outside ${file} (${lineCount} lines)`);
    }
  }

  const marked = parseHighlight(highlight);
  const noted = new Set(notes.map((note) => note.line));
  const transformers: NonNullable<ServerCodeBlockProps['transformers']> = [
    {
      line(node, line) {
        if (marked.has(line)) this.addClassToHast(node, 'annotated-hl');
        if (noted.has(line)) this.addClassToHast(node, 'annotated-note');
      },
    },
  ];

  return (
    <div className="annotated-code my-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <ServerCodeBlock
          code={code}
          lang={languageFor(file)}
          fallbackLanguage="text"
          themes={{ light: 'github-light', dark: 'github-dark' }}
          transformers={transformers}
          codeblock={{ title: title ?? (region ? `${file} (${region})` : file) }}
        />
      </div>
      {notes.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
          {notes.map((note) => (
            <li key={`${note.line}`} className="rounded-lg border bg-fd-card p-3">
              <span className="mb-1 block text-xs font-semibold text-fd-muted-foreground">
                Line {note.line}
              </span>
              {note.children}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
