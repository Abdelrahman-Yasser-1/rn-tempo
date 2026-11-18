import { useMemo } from 'react';

import { qrMatrix, qrPath } from '../lib/qr';

const QUIET_ZONE = 2;

/** A QR code drawn as one SVG path, so nothing is injected as HTML and no image request is made. */
export function QrCode({ text, label, size = 168 }: { text: string; label: string; size?: number }) {
  const matrix = useMemo(() => qrMatrix(text), [text]);
  if (matrix === null) return <p className="muted">That text is too long for a QR code.</p>;
  const total = matrix.length + QUIET_ZONE * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      className="qr"
      width={size}
      height={size}
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${total} ${total}`}
      shapeRendering="crispEdges"
    >
      <rect x={-QUIET_ZONE} y={-QUIET_ZONE} width={total} height={total} fill="#fff" />
      <path d={qrPath(matrix)} fill="#000" />
    </svg>
  );
}
