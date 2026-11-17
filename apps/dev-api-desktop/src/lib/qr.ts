import qrcode from 'qrcode-generator';

/** The dark modules of a QR code as a square grid. `null` when the text is too long to encode. */
export function qrMatrix(text: string): boolean[][] | null {
  try {
    const code = qrcode(0, 'M');
    code.addData(text);
    code.make();
    const size = code.getModuleCount();
    return Array.from({ length: size }, (_row, r) => Array.from({ length: size }, (_cell, c) => code.isDark(r, c)));
  } catch {
    return null;
  }
}

/** One SVG path (`M x y h1 v1 h-1z` per dark module) for a matrix. */
export function qrPath(matrix: boolean[][]): string {
  const parts: string[] = [];
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x} ${y}h1v1h-1z`);
    });
  });
  return parts.join('');
}
