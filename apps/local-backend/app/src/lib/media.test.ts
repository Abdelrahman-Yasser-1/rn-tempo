import { describe, expect, it } from 'vitest';

import { iconLabel, previewKind } from './media';

describe('previewKind', () => {
  it('previews images, video and audio', () => {
    expect(previewKind('image/png', 100)).toBe('image');
    expect(previewKind('IMAGE/JPEG; charset=x', 100)).toBe('image');
    expect(previewKind('video/mp4', 100)).toBe('video');
    expect(previewKind('audio/mpeg', 100)).toBe('audio');
  });

  it('never previews SVG, HTML or XML, whatever they are called', () => {
    for (const mime of ['image/svg+xml', 'IMAGE/SVG+XML', 'image/svg', 'text/html', 'application/xhtml+xml', 'text/xml', 'application/xml']) {
      expect(previewKind(mime, 10)).toBe('icon');
    }
  });

  it('gives every other type, and every huge file, an icon', () => {
    for (const mime of ['application/pdf', 'application/zip', 'text/plain', 'application/octet-stream', '']) expect(previewKind(mime, 10)).toBe('icon');
    expect(previewKind('image/png', 26 * 1024 * 1024)).toBe('icon');
    expect(previewKind('video/mp4', 61 * 1024 * 1024)).toBe('icon');
  });

  it('labels icons', () => {
    expect(iconLabel('application/pdf', 'report.pdf')).toBe('PDF');
    expect(iconLabel('application/zip', 'noext')).toBe('ZIP');
  });
});
