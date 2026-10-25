import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { toNpm } from '@/lib/commands';

type CommandTabsProps = Readonly<{
  /** The yarn command without the `yarn` prefix, e.g. `add zod` or `android:dev`. */
  yarn: string;
  /** Overrides the npm command derived from `yarn`. Written in full, e.g. `npm install zod`. */
  npm?: string;
}>;

/** yarn and npm variants of one command, in tabs. */
export function CommandTabs({ yarn, npm }: CommandTabsProps) {
  const commands = [
    { label: 'yarn', code: `yarn ${yarn}` },
    { label: 'npm', code: npm ?? toNpm(yarn) },
  ];
  return (
    <Tabs items={commands.map((command) => command.label)}>
      {commands.map((command) => (
        <Tab key={command.label} value={command.label}>
          <ServerCodeBlock
            code={command.code}
            lang="bash"
            themes={{ light: 'github-light', dark: 'github-dark' }}
          />
        </Tab>
      ))}
    </Tabs>
  );
}
