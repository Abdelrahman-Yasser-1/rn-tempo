import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useClient } from '../client/context';
import type { NodeInfo } from '../client/types';
import { keys } from '../hooks/queries';

/**
 * Shown instead of the app when Node 22+ is missing (AC-DA-7). It says what is wrong, where to get
 * Node, and offers a re-check, so installing Node needs no restart. It does not open links itself: the
 * page has no network access, so the address is shown to copy.
 */
export function NodeMissing({ node }: { node: NodeInfo }) {
  const client = useClient();
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);
  const recheck = () => {
    setChecking(true);
    void client
      .nodeInfo(true)
      .then((fresh) => {
        queryClient.setQueryData(keys.node, fresh);
      })
      .finally(() => {
        setChecking(false);
      });
  };
  return (
    <main className="centered" role="alert">
      <h1>Node.js is needed</h1>
      <p>{node.message ?? 'Node.js was not found.'}</p>
      <ol>
        <li>
          Install Node 22 or newer from <code>{node.docsUrl}</code> (or with your version manager).
        </li>
        <li>Make sure it is on the PATH of your login shell: run <code>command -v node</code> in a new terminal.</li>
        <li>Check again below. You do not need to restart the app.</li>
      </ol>
      <button type="button" onClick={recheck} disabled={checking}>
        {checking ? 'Checking…' : 'Check again'}
      </button>
    </main>
  );
}
