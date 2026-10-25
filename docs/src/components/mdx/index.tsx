import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { AnnotatedCode, Note } from './AnnotatedCode';
import { File, FileTree, Folder } from './FileTree';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    AnnotatedCode,
    Note,
    FileTree,
    Folder,
    File,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
