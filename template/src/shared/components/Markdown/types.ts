import type { ColorTokens } from '@theme/tokens';

export type MarkdownProps = Readonly<{
  /**
   * Markdown source. A safe subset renders: paragraphs, `#`-`###` headings, `**bold**`,
   * `*italic*` or `_italic_`, `` `code` ``, `[links](https://...)` (http, https and mailto only),
   * bullet and numbered lists. Anything else is shown as plain text.
   */
  children: string;
  /** Color token of the body text; defaults to `textPrimary`. Links use `primary`. */
  color?: keyof ColorTokens;
  /** Parts: `${testID}.block-<n>` per block. */
  testID?: string;
}>;
