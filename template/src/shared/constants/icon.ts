/** Icon sizes in points: `xs` 12, `sm` 16, `md` 20, `lg` 24, `xl` 32. */
export const ICON_SIZES = { xs: 12, sm: 16, md: 20, lg: 24, xl: 32 } as const;

export type IconSize = keyof typeof ICON_SIZES;
