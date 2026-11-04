import { computeTooltipLayout } from './tooltipLayout';

const GEOMETRY = {
  windowWidth: 400,
  windowHeight: 800,
  maxWidth: 280,
  margin: 16,
  gap: 8,
  arrowSize: 12,
};

describe('computeTooltipLayout', () => {
  const anchor = { x: 180, y: 400, width: 40, height: 40 };

  it('centres the column on the trigger above it', () => {
    const layout = computeTooltipLayout({ ...GEOMETRY, anchor, placement: 'top', isRtl: false });
    expect(layout.placement).toBe('top');
    expect(layout.bottom).toBe(800 - 400 + 8);
    expect(layout.startOffset).toBe(200 - 140);
    expect(layout.arrowOffset).toBe(140 - 6);
  });

  it('sits below the trigger for bottom placement', () => {
    const layout = computeTooltipLayout({ ...GEOMETRY, anchor, placement: 'bottom', isRtl: false });
    expect(layout.top).toBe(400 + 40 + 8);
  });

  it('flips to the other side when the preferred one has no room', () => {
    const nearTop = { ...anchor, y: 10 };
    expect(
      computeTooltipLayout({ ...GEOMETRY, anchor: nearTop, placement: 'top', isRtl: false })
        .placement,
    ).toBe('bottom');
  });

  it('clamps to the window edge and keeps the arrow on the trigger', () => {
    const atEdge = { x: 4, y: 400, width: 40, height: 40 };
    const layout = computeTooltipLayout({
      ...GEOMETRY,
      anchor: atEdge,
      placement: 'top',
      isRtl: false,
    });
    expect(layout.startOffset).toBe(16);
    expect(layout.arrowOffset).toBe(24 - 16 - 6);
  });

  it('measures from the right edge in RTL', () => {
    const atRight = { x: 360, y: 400, width: 40, height: 40 };
    const rtl = computeTooltipLayout({
      ...GEOMETRY,
      anchor: atRight,
      placement: 'top',
      isRtl: true,
    });
    expect(rtl.startOffset).toBe(16);
    expect(rtl.arrowOffset).toBe(0);
  });
});
