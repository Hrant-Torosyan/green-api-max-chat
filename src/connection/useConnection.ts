import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createGreenApiClient,
  type GreenApiClient,
  type GreenApiCredentials,
  type InstanceState,
} from '../green-api/client';
import { clearSession, disableAutoConnect, loadCredentials, saveCredentials } from '../storage';
import { checkInstance, type ConnectionProblem, type ConnectionWarning } from './checkInstance';
import { parseCredentials } from './credentials';

type ConnectionState =
  | { status: 'restoring'; credentials: GreenApiCredentials }
  | {
      status: 'disconnected';
      credentials: GreenApiCredentials | null;
      problem: ConnectionProblem | null;
    }
  | { status: 'connecting'; credentials: GreenApiCredentials }
  | {
      status: 'connected';
      credentials: GreenApiCredentials;
      client: GreenApiClient;
      instanceState: InstanceState;
      warnings: ConnectionWarning[];
    };

export function useConnection() {
  const [initialState] = useState(restoreState);
  const [state, setState] = useState<ConnectionState>(initialState);
  const pendingCheck = useRef<AbortController | null>(null);

  const startCheck = useCallback((credentials: GreenApiCredentials) => {
    pendingCheck.current?.abort();
    const controller = new AbortController();
    pendingCheck.current = controller;

    void resolveConnection(credentials, controller.signal).then((next) => {
      // A newer attempt or a disconnect has taken over.
      if (controller.signal.aborted) return;
      pendingCheck.current = null;
      if (next.status === 'connected') saveCredentials(credentials);
      setState(next);
    });
  }, []);

  useEffect(() => {
    if (initialState.status === 'restoring') startCheck(initialState.credentials);
    return () => pendingCheck.current?.abort();
  }, [initialState, startCheck]);

  const connect = useCallback(
    (credentials: GreenApiCredentials) => {
      setState({ status: 'connecting', credentials });
      startCheck(credentials);
    },
    [startCheck],
  );

  const disconnect = useCallback(() => {
    pendingCheck.current?.abort();
    pendingCheck.current = null;
    clearSession();
    setState({ status: 'disconnected', credentials: null, problem: null });
  }, []);

  const connectionLost = useCallback((problem: ConnectionProblem) => {
    disableAutoConnect();
    setState((current) =>
      current.status === 'connected'
        ? { status: 'disconnected', credentials: current.credentials, problem }
        : current,
    );
  }, []);

  const setInstanceState = useCallback((instanceState: InstanceState) => {
    setState((current) => {
      if (current.status !== 'connected') return current;
      const settingsWarnings = current.warnings.filter((warning) => warning !== 'accountSuspended');
      const warnings: ConnectionWarning[] =
        instanceState === 'suspended'
          ? ['accountSuspended', ...settingsWarnings]
          : settingsWarnings;
      return { ...current, instanceState, warnings };
    });
  }, []);

  return { state, connect, disconnect, connectionLost, setInstanceState };
}

async function resolveConnection(
  credentials: GreenApiCredentials,
  signal: AbortSignal,
): Promise<ConnectionState> {
  const client = createGreenApiClient(credentials);
  const result = await checkInstance(client, signal);
  return result.ok
    ? {
        status: 'connected',
        credentials,
        client,
        instanceState: result.instanceState,
        warnings: result.warnings,
      }
    : { status: 'disconnected', credentials, problem: result.problem };
}

function restoreState(): ConnectionState {
  const stored = loadCredentials();
  const parsed = stored && parseCredentials(stored.credentials);
  if (!stored || !parsed?.ok) return { status: 'disconnected', credentials: null, problem: null };
  return stored.autoConnect
    ? { status: 'restoring', credentials: parsed.credentials }
    : { status: 'disconnected', credentials: parsed.credentials, problem: null };
}
