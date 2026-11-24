import { Fragment, useMemo } from 'react';
import { View } from 'react-native';

import { openUrlSafe } from '@services/linking/linking';
import { Text } from '@shared/components/Text';
import type { TextProps } from '@shared/components/Text';
import { inlineToText, parseMarkdown } from '@shared/utils/markdown';
import type { InlineNode, MarkdownBlock } from '@shared/utils/markdown';
import type { ColorTokens, TypographyVariant } from '@theme/tokens';

import { styles } from './styles';
import type { MarkdownProps } from './types';

// `#` is the biggest heading inside content, so `h1` stays free for the screen title.
const HEADING_VARIANTS = { 1: 'h2', 2: 'h3', 3: 'title' } as const;

type Marks = Readonly<{ bold: boolean; italic: boolean; code: boolean; link: boolean }>;
type InlineProps = Readonly<{
  nodes: readonly InlineNode[];
  variant: TypographyVariant;
  color: keyof ColorTokens;
  marks?: Marks;
}>;

const NO_MARKS: Marks = { bold: false, italic: false, code: false, link: false };

/** Renders inline nodes as nested `Text`, so a paragraph reads as one text for screen readers. */
function Inline({ nodes, variant, color, marks = NO_MARKS }: InlineProps) {
  return nodes.map((node, index) => {
    const key = `${node.type}-${String(index)}`;
    switch (node.type) {
      case 'text': {
        // Bold only restyles body text; headings are already strong.
        const textVariant = marks.bold && variant === 'body' ? 'bodyStrong' : variant;
        const style: TextProps['style'] = [
          marks.italic && styles.italic,
          marks.code && styles.code,
          marks.link && styles.link,
        ];
        return (
          <Text
            key={key}
            variant={textVariant}
            color={marks.link ? 'primary' : color}
            // Nested spans must not repeat the heading role of the block around them.
            accessibilityRole="text"
            style={style}
          >
            {node.text}
          </Text>
        );
      }
      case 'code':
        return (
          <Inline
            key={key}
            nodes={[{ type: 'text', text: node.text }]}
            variant={variant}
            color={color}
            marks={{ ...marks, code: true }}
          />
        );
      case 'strong':
        return (
          <Inline
            key={key}
            nodes={node.children}
            variant={variant}
            color={color}
            marks={{ ...marks, bold: true }}
          />
        );
      case 'em':
        return (
          <Inline
            key={key}
            nodes={node.children}
            variant={variant}
            color={color}
            marks={{ ...marks, italic: true }}
          />
        );
      case 'link':
        return (
          <Text
            key={key}
            variant={variant}
            color="primary"
            accessibilityRole="link"
            accessibilityLabel={inlineToText(node.children)}
            onPress={() => {
              void openUrlSafe(node.href);
            }}
          >
            <Inline
              nodes={node.children}
              variant={variant}
              color="primary"
              marks={{ ...marks, link: true }}
            />
          </Text>
        );
      case 'break':
        return <Fragment key={key}>{'\n'}</Fragment>;
    }
  });
}

type BlockProps = Readonly<{ block: MarkdownBlock; color: keyof ColorTokens; testID?: string }>;

function Block({ block, color, testID }: BlockProps) {
  switch (block.type) {
    case 'heading':
      return (
        <Text
          variant={HEADING_VARIANTS[block.level]}
          color={color}
          accessibilityRole="header"
          testID={testID}
        >
          <Inline nodes={block.children} variant={HEADING_VARIANTS[block.level]} color={color} />
        </Text>
      );
    case 'paragraph':
      return (
        <Text color={color} testID={testID}>
          <Inline nodes={block.children} variant="body" color={color} />
        </Text>
      );
    case 'list':
      return (
        <View accessibilityRole="list" style={styles.list} testID={testID}>
          {block.items.map((item, index) => (
            <View key={`item-${String(index)}`} style={styles.item}>
              <Text
                color={color}
                style={styles.marker}
                accessibilityElementsHidden={!block.isOrdered}
                importantForAccessibility={block.isOrdered ? 'auto' : 'no-hide-descendants'}
              >
                {block.isOrdered ? `${String(block.start + index)}.` : '•'}
              </Text>
              <Text color={color} style={styles.itemText}>
                <Inline nodes={item} variant="body" color={color} />
              </Text>
            </View>
          ))}
        </View>
      );
  }
}

/**
 * Renders a safe Markdown subset with the theme: paragraphs, headings, bold, italic, inline code,
 * http/https/mailto links and lists. No HTML and no images; the input length is capped.
 */
export function Markdown({ children, color = 'textPrimary', testID }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(children), [children]);
  if (blocks.length === 0) {
    return null;
  }
  return (
    <View style={styles.root} testID={testID}>
      {blocks.map((block, index) => (
        <Block
          key={`${block.type}-${String(index)}`}
          block={block}
          color={color}
          testID={testID ? `${testID}.block-${String(index)}` : undefined}
        />
      ))}
    </View>
  );
}
