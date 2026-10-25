import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { AnnotatedCode, Note } from './AnnotatedCode';
import { CommandTabs } from './CommandTabs';
import { Do, DoDont, Dont } from './DoDont';
import { EnvMatrix } from './EnvMatrix';
import { FeatureBadge } from './FeatureBadge';
import { File, FileTree, Folder } from './FileTree';
import { Mermaid } from './Mermaid';
import { RuleCard } from './RuleCard';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    AnnotatedCode,
    Note,
    CommandTabs,
    Do,
    DoDont,
    Dont,
    EnvMatrix,
    FeatureBadge,
    FileTree,
    Folder,
    File,
    Mermaid,
    RuleCard,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
