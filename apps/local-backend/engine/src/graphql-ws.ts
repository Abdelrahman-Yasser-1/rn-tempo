import type { WebSocket, RawData } from 'ws';

import type { AuthUser } from './accounts.ts';
import { prepare, variablesOf, type GqlContext, type GraphqlRuntime, type RequestError } from './graphql.ts';
import { logText, type Hub } from './realtime.ts';
import { isPlainObject } from './values.ts';
import type { LiveDeps, LiveSocket } from './websocket.ts';

/**
 * GraphQL over WebSocket with the `graphql-transport-ws` subprotocol (the graphql-ws protocol): connection_init and
 * connection_ack, ping and pong, subscribe, next, error and complete. The `graphql-ws` package is not used: it would take
 * over the socket (its own server loop, close handling and limits) while this engine already owns the sockets, their limits
 * and their request log. The subset a client needs is small and written against the protocol document.
 */

export const GRAPHQL_WS_PROTOCOL = 'graphql-transport-ws';

/** The close codes of the protocol (and the WebSocket ones it reuses). */
export const CLOSE = {
  invalidMessage: 4400,
  unauthorized: 4401,
  forbidden: 4403,
  initTimeout: 4408,
  duplicate: 4409,
  tooManyInits: 4429,
  subprotocol: 1002,
} as const;

export interface GraphqlSocketInput {
  ws: WebSocket;
  client: LiveSocket;
  hub: Hub;
  runtime: GraphqlRuntime;
  /** The request the socket came in on, and the user it signed in with (when it did). */
  context: GqlContext;
  /** Reads a bearer token and returns the user, when it is good. */
  authenticate: (token: string) => AuthUser | undefined;
  /** The endpoint asks for a sign-in on every operation. */
  requireSignIn: boolean;
  initTimeoutMs: number;
  maxOperations: number;
  deps: LiveDeps;
  endpointId: string;
  url: string;
}

const tokenOf = (payload: unknown): string | undefined => {
  if (!isPlainObject(payload)) return undefined;
  for (const key of ['Authorization', 'authorization', 'token', 'authToken', 'accessToken']) {
    const value = payload[key];
    if (typeof value === 'string' && value !== '') return value.replace(/^Bearer\s+/i, '');
  }
  return undefined;
};

const textOf = (data: RawData): string => (Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]).toString('utf8'));

/** Runs the protocol on a socket that has already been upgraded with the `graphql-transport-ws` subprotocol. */
export function runGraphqlSocket(input: GraphqlSocketInput): void {
  const { ws, client, hub, runtime, deps } = input;
  const operations = new Map<string, { stop: () => void }>();
  let acked = false;
  let initialised = false;
  let user = input.context.user;
  const initTimer = setTimeout(() => client.close(CLOSE.initTimeout, 'Connection initialisation timeout'), input.initTimeoutMs);
  initTimer.unref();
  client.whenGone(() => {
    clearTimeout(initTimer);
    for (const operation of [...operations.values()]) operation.stop();
    operations.clear();
    deps.record({ endpointId: input.endpointId, url: input.url, status: 200, ms: 0, resBody: { event: 'disconnect', client: client.id } });
  });
  const send = (message: Record<string, unknown>): boolean => client.sendText(JSON.stringify(message));
  const sendError = (id: string, errors: RequestError[]): void => void send({ id, type: 'error', payload: errors });
  const context = (): GqlContext => ({ ...input.context, user });

  const subscribe = async (id: string, payload: Record<string, unknown>): Promise<void> => {
    const query = payload.query;
    if (typeof query !== 'string') return void client.close(CLOSE.invalidMessage, 'Invalid message');
    const operationName = typeof payload.operationName === 'string' ? payload.operationName : undefined;
    const prepared = prepare(runtime.model, runtime.limits, { query, operationName });
    if (!prepared.ok) return sendError(id, prepared.errors);
    const { prepared: operation } = prepared;
    const denied = input.requireSignIn && user === undefined ? [{ message: 'You must sign in.', extensions: { code: 'UNAUTHENTICATED' } }] : runtime.authErrors(operation, user);
    if (denied.length > 0) return sendError(id, denied);
    deps.record({ endpointId: input.endpointId, url: input.url, status: 200, ms: 0, reqBody: { type: 'subscribe', id, query }, operation: operation.name });
    hub.log({ direction: 'in', clientId: client.id, text: logText(`${operation.type} ${operation.name}`) });
    let stopped = false;
    let stream: AsyncGenerator<unknown, void, void> | undefined;
    operations.set(id, {
      stop: () => {
        stopped = true;
        void stream?.return();
      },
    });
    const finish = (): void => {
      operations.delete(id);
    };
    try {
      const variables = variablesOf(payload.variables);
      if (operation.type === 'subscription') {
        const started = await runtime.subscribe(operation, variables, context());
        if (!(Symbol.asyncIterator in started)) {
          finish();
          return sendError(id, (started.errors ?? []).map((error) => error.toJSON() as RequestError));
        }
        stream = started;
        if (stopped) return void (await started.return());
        for await (const result of started) {
          if (stopped) break;
          send({ id, type: 'next', payload: result });
        }
        if (!stopped) send({ id, type: 'complete' });
      } else {
        const result = await runtime.execute(operation, variables, context());
        if (!stopped) {
          send({ id, type: 'next', payload: result });
          send({ id, type: 'complete' });
        }
      }
    } catch (error) {
      if (!stopped) sendError(id, [{ message: error instanceof Error ? error.message : 'The operation failed.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }]);
    } finally {
      finish();
    }
  };

  ws.on('message', (data: RawData, isBinary: boolean) => {
    client.messagesIn += 1;
    if (isBinary) return void client.close(CLOSE.invalidMessage, 'Invalid message');
    let message: unknown;
    try {
      message = JSON.parse(textOf(data)) as unknown;
    } catch {
      return void client.close(CLOSE.invalidMessage, 'Invalid message');
    }
    if (!isPlainObject(message) || typeof message.type !== 'string') return void client.close(CLOSE.invalidMessage, 'Invalid message');
    switch (message.type) {
      case 'connection_init': {
        if (initialised) return void client.close(CLOSE.tooManyInits, 'Too many initialisation requests');
        initialised = true;
        const token = tokenOf(message.payload);
        if (token !== undefined) user = input.authenticate(token) ?? user;
        if (input.requireSignIn && user === undefined) return void client.close(CLOSE.forbidden, 'Forbidden');
        clearTimeout(initTimer);
        acked = true;
        hub.log({ direction: 'system', clientId: client.id, text: 'connection_init' });
        send({ type: 'connection_ack' });
        return;
      }
      case 'ping':
        send({ type: 'pong' });
        return;
      case 'pong':
        return;
      case 'complete': {
        if (typeof message.id === 'string') operations.get(message.id)?.stop();
        return;
      }
      case 'subscribe': {
        if (!acked) return void client.close(CLOSE.unauthorized, 'Unauthorized');
        if (typeof message.id !== 'string' || message.id === '' || !isPlainObject(message.payload)) return void client.close(CLOSE.invalidMessage, 'Invalid message');
        if (operations.has(message.id)) return void client.close(CLOSE.duplicate, `Subscriber for ${message.id} already exists`);
        if (operations.size >= input.maxOperations) return sendError(message.id, [{ message: `This connection already runs ${String(input.maxOperations)} operations.`, extensions: { code: 'TOO_MANY_OPERATIONS' } }]);
        void subscribe(message.id, message.payload);
        return;
      }
      default:
        client.close(CLOSE.invalidMessage, 'Invalid message');
    }
  });
}
