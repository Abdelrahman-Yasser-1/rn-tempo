import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UploadProgress } from '../api/types';
import { adminRoutes, makeApi, renderWithApi, RUNNING } from '../test/fakeApi';

import { Media } from './Media';

const item = (id: string, name: string, mime: string, size = 1000) => ({ id, url: `/media/${id}`, originalName: name, mime, size, createdAt: '2026-11-18T08:00:00Z' });
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const C = 'c'.repeat(32);
const D = 'd'.repeat(32);
const items = [item(A, 'cat.png', 'image/png'), item(B, 'logo.svg', 'image/svg+xml'), item(C, 'report.pdf', 'application/pdf'), item(D, 'clip.mp4', 'video/mp4')];

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const calls: string[] = [];
  const api = makeApi({
    admin: adminRoutes({
      'GET /media': () => ({ items, total: items.length, skip: 0, limit: 60 }),
      'GET /media/usage': () => ({ files: 4, bytes: 4000, maxBytes: 1 }),
      'DELETE /media/:id': (_r, p) => (calls.push(`DELETE ${p.id ?? ''}`), { ok: true }),
    }),
    mediaPreview: vi.fn(() => Promise.resolve(new ArrayBuffer(4))),
  });
  renderWithApi(<Media backend={RUNNING} />, api);
  return { api, calls };
}

describe('Media', () => {
  it('shows a grid, the storage total and one sentence about dropping files', async () => {
    setup();
    expect(await screen.findByText('cat.png')).toBeInTheDocument();
    expect(screen.getByText('3.9 KB in 4 files')).toBeInTheDocument();
    expect(screen.getByText(/Drop files anywhere/)).toBeInTheDocument();
  });

  it('previews an image through a blob URL, and never loads SVG or other types', async () => {
    const { api } = setup();
    const image = await screen.findByRole('img', { name: 'cat.png' });
    await waitFor(() => {
      expect(image).toHaveAttribute('src', 'blob:fake');
    });
    expect(api.mediaPreview).toHaveBeenCalledTimes(1);
    expect(api.mediaPreview).toHaveBeenCalledWith('/work/shop', A);
    // The SVG and the PDF are icons, not images, and Rust was never asked for their bytes.
    expect(screen.getByRole('img', { name: 'logo.svg (no preview)' })).toHaveTextContent('SVG');
    expect(screen.getByRole('img', { name: 'report.pdf (no preview)' })).toHaveTextContent('PDF');
    expect(document.querySelector('img[src*="svg"]')).toBeNull();
    expect(vi.mocked(api.mediaPreview).mock.calls.map(([, id]) => id)).toEqual([A]);
  });

  it('loads a video only when asked', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Load video' }));
    await waitFor(() => {
      expect(document.querySelector('video')).not.toBeNull();
    });
    expect(vi.mocked(api.mediaPreview).mock.calls.map(([, id]) => id)).toContain(D);
  });

  it('shows an icon when Rust refuses the preview', async () => {
    const { api } = setup();
    vi.mocked(api.mediaPreview).mockRejectedValue(new Error('This type of file is not previewed.'));
    expect(await screen.findByRole('img', { name: 'cat.png (no preview)' })).toBeInTheDocument();
  });

  it('uploads with a button and reports the result', async () => {
    const { api } = setup();
    vi.mocked(api.uploadMedia).mockResolvedValue({ uploaded: 2, failed: ['big.bin: it is larger than 512 MB'] });
    await userEvent.click(await screen.findByRole('button', { name: 'Upload files…' }));
    expect(await screen.findByText(/Uploaded 2 files\. Not uploaded: big\.bin/)).toBeInTheDocument();
  });

  it('uploads dropped files and shows progress from Rust', async () => {
    let drop: (count: number) => void = () => undefined;
    let progress: (event: UploadProgress) => void = () => undefined;
    const { api } = setup();
    vi.mocked(api.onDropped).mockImplementation((handler) => {
      drop = handler;
      return Promise.resolve(() => undefined);
    });
    vi.mocked(api.onUpload).mockImplementation((handler) => {
      progress = handler;
      return Promise.resolve(() => undefined);
    });
    vi.mocked(api.uploadDropped).mockResolvedValue({ uploaded: 1, failed: [] });
    // Remount so the new listeners are used.
    document.body.innerHTML = '';
    renderWithApi(<Media backend={RUNNING} />, api);
    await screen.findByText('cat.png');
    await waitFor(() => {
      expect(api.onDropped).toHaveBeenCalled();
    });
    act(() => {
      progress({ name: 'photo.jpg', sent: 50, total: 100, index: 0, count: 1 });
    });
    expect(screen.getByRole('progressbar', { name: 'Uploading photo.jpg' })).toHaveAttribute('value', '50');
    act(() => {
      drop(1);
    });
    expect(await screen.findByText('Uploaded 1 file.')).toBeInTheDocument();
    expect(api.uploadDropped).toHaveBeenCalledWith('/work/shop');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('filters by type through the engine', async () => {
    const { api } = setup();
    await screen.findByText('cat.png');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'image');
    await waitFor(() => {
      expect(vi.mocked(api.admin).mock.calls.some(([, request]) => request.path.includes('type=image'))).toBe(true);
    });
  });

  it('downloads through a Rust save dialog and copies the full URL', async () => {
    const { api } = setup();
    vi.mocked(api.downloadMedia).mockResolvedValue('/Users/me/cat.png');
    await userEvent.click(await screen.findByRole('button', { name: 'Download cat.png' }));
    expect(api.downloadMedia).toHaveBeenCalledWith('/work/shop', A);
    expect(await screen.findByText('Saved to /Users/me/cat.png.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Copy URL https://localhost:8556/media/${A}` })).toBeInTheDocument();
  });

  it('deleting asks first and names the file', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete report.pdf' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this file?' });
    expect(dialog).toHaveTextContent('report.pdf');
    expect(dialog).toHaveTextContent('for good');
    expect(calls).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete file' }));
    await waitFor(() => {
      expect(calls).toEqual([`DELETE ${C}`]);
    });
  });
});
