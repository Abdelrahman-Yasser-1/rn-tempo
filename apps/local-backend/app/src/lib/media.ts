export type PreviewKind = 'image' | 'video' | 'audio' | 'icon';

/** The largest file that is loaded for a preview. Bigger ones get an icon (Rust enforces the same limits). */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_STREAM_BYTES = 60 * 1024 * 1024;

/**
 * How a stored file is shown in the window. Only images (never SVG), video and audio are previewed. SVG, HTML and
 * XML can carry script, so they get an icon like every other type. Rust applies the same rule before it sends bytes.
 */
export function previewKind(mime: string, size: number): PreviewKind {
  const essence = (mime.split(';')[0] ?? '').trim().toLowerCase();
  if (essence.includes('svg') || essence.includes('html') || essence.includes('xml')) return 'icon';
  if (essence.startsWith('image/')) return size <= MAX_IMAGE_BYTES ? 'image' : 'icon';
  if (essence.startsWith('video/')) return size <= MAX_STREAM_BYTES ? 'video' : 'icon';
  if (essence.startsWith('audio/')) return size <= MAX_STREAM_BYTES ? 'audio' : 'icon';
  return 'icon';
}

/** A short label for the icon, such as `PDF` or `ZIP`. */
export function iconLabel(mime: string, name: string): string {
  const fromName = /\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1];
  if (fromName !== undefined) return fromName.toUpperCase();
  return ((mime.split('/')[1] ?? 'file').split(/[+;]/)[0] ?? 'file').slice(0, 5).toUpperCase();
}

export const MEDIA_FILTERS = [
  { value: '', label: 'All files' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'application/pdf', label: 'PDF' },
] as const;
