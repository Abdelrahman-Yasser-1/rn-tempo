import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeClient, NODE_OK, renderWithClient } from '../test/fakeClient';

import { NodeMissing } from './NodeMissing';

const MISSING = { ...NODE_OK, ok: false, path: null, version: null, message: 'Node.js was not found in your login shell.' };

describe('NodeMissing', () => {
  it('says what is wrong and where to get Node, without crashing', () => {
    renderWithClient(<NodeMissing node={MISSING} />, makeClient());
    expect(screen.getByRole('alert')).toHaveTextContent('Node.js is needed');
    expect(screen.getByText('Node.js was not found in your login shell.')).toBeInTheDocument();
    expect(screen.getByText(MISSING.docsUrl)).toBeInTheDocument();
  });

  it('asks the shell to look again when the button is pressed', async () => {
    const nodeInfo = vi.fn(() => Promise.resolve(NODE_OK));
    renderWithClient(<NodeMissing node={MISSING} />, makeClient({ nodeInfo }));
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(nodeInfo).toHaveBeenCalledWith(true));
  });
});
