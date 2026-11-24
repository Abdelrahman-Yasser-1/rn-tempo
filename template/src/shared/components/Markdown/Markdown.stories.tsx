import type { Meta, StoryObj } from '@storybook/react-native';

import { Markdown } from './Markdown';

const EN = `# What's new

This release adds **bold**, *italic* and \`inline code\`, plus a [link](https://example.com).

## Highlights

- Faster start
- Dark mode for every palette
- Five languages

1. Update the app
2. Open **Settings**
3. Pick a language

Hard line break:  
second line.`;

const AR = `# ما الجديد

يضيف هذا الإصدار **خطًا عريضًا** و*مائلًا* و\`شيفرة\`، مع [رابط](https://example.com).

## أبرز التحسينات

- بدء أسرع
- الوضع الداكن لكل لوحة ألوان
- خمس لغات

1. حدّث التطبيق
2. افتح **الإعدادات**
3. اختر اللغة`;

const UNSAFE = `[javascript link](javascript:alert(1)) shows as text.

<b>HTML</b> and ![images](https://example.com/a.png) are not rendered.`;

const meta = {
  title: 'Display/Markdown',
  component: Markdown,
  args: { children: EN },
  argTypes: { color: { control: 'select', options: ['textPrimary', 'textSecondary'] } },
} satisfies Meta<typeof Markdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Arabic: Story = { args: { children: AR } };

export const UnsafeInput: Story = { args: { children: UNSAFE } };
