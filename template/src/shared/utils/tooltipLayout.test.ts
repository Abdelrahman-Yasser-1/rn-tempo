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

  it('flips a bottom bubble up when there is no room below', () => {
    const nearBottom = { ...anchor, y: 760 };
    const layout = computeTooltipLayout({
      ...GEOMETRY,
      anchor: nearBottom,
      placement: 'bottom',
      isRtl: false,
    });
    expect(layout.placement).toBe('top');
    expect(layout.bottom).toBe(800 - 760 + 8);
    expect(layout.top).toBeUndefined();
  });

  it('keeps the preferred side when it has room', () => {
    const roomy = { ...anchor, y: 120 };
    expect(
      computeTooltipLayout({ ...GEOMETRY, anchor: roomy, placement: 'top', isRtl: false })
        .placement,
    ).toBe('top');
    expect(
      computeTooltipLayout({ ...GEOMETRY, anchor: roomy, placement: 'bottom', isRtl: false })
        .placement,
    ).toBe('bottom');
  });

  it('does not flip to a side that has even less room', () => {
    const tiny = { ...GEOMETRY, windowHeight: 100 };
    const middle = { x: 180, y: 30, width: 40, height: 40 };
    const layout = computeTooltipLayout({
      ...tiny,
      anchor: middle,
      placement: 'top',
      isRtl: false,
    });
    expect(layout.placement).toBe('top');
  });

  it('clamps to the right edge and keeps the arrow inside the column', () => {
    const atRight = { x: 360, y: 400, width: 40, height: 40 };
    const layout = computeTooltipLayout({
      ...GEOMETRY,
      anchor: atRight,
      placement: 'top',
      isRtl: false,
    });
    expect(layout.startOffset).toBe(400 - 16 - 280);
    expect(layout.arrowOffset).toBe(280 - 12);
  });

  it('measures from the right edge in RTL when the trigger is on the left', () => {
    const atLeft = { x: 4, y: 400, width: 40, height: 40 };
    const layout = computeTooltipLayout({
      ...GEOMETRY,
      anchor: atLeft,
      placement: 'top',
      isRtl: true,
    });
    // Physically the column is 16 from the left, which is 104 from the start (right) edge.
    expect(layout.startOffset).toBe(104);
    // The trigger centre is 8 from the column's physical left edge, its end side in RTL, so the
    // arrow sits 280 - 8 - 6 from the start edge.
    expect(layout.arrowOffset).toBe(280 - (24 - 16) - 6);
  });

  it('centres on the trigger in RTL as in LTR', () => {
    const ltr = computeTooltipLayout({ ...GEOMETRY, anchor, placement: 'top', isRtl: false });
    const rtl = computeTooltipLayout({ ...GEOMETRY, anchor, placement: 'top', isRtl: true });
    expect(rtl.startOffset).toBe(ltr.startOffset);
    expect(rtl.arrowOffset).toBe(ltr.arrowOffset);
  });

  it('narrows the column to fit a small window', () => {
    const layout = computeTooltipLayout({
      ...GEOMETRY,
      windowWidth: 300,
      anchor: { x: 130, y: 400, width: 40, height: 40 },
      placement: 'top',
      isRtl: false,
    });
    expect(layout.width).toBe(300 - 16 * 2);
    expect(layout.startOffset).toBe(16);
  });
});
