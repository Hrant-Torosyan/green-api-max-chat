import styles from './App.module.css';
import { ConnectScreen } from './connection/ConnectScreen';
import { InstanceStatus } from './connection/InstanceStatus';
import { useConnection } from './connection/useConnection';
import { Workspace } from './workspace/Workspace';

export function App() {
  const { state, connect, disconnect, connectionLost, setInstanceState } = useConnection();

  switch (state.status) {
    case 'restoring':
      return (
        <main className={styles.restoring}>
          <p role="status">Подключение…</p>
        </main>
      );
    case 'disconnected':
    case 'connecting':
      return (
        <ConnectScreen
          initialCredentials={state.credentials}
          connecting={state.status === 'connecting'}
          problem={state.status === 'disconnected' ? state.problem : null}
          onConnect={connect}
        />
      );
    case 'connected':
      return (
        <Workspace
          idInstance={state.credentials.idInstance}
          client={state.client}
          onInstanceStateChange={setInstanceState}
          onFatalError={(kind) => connectionLost({ type: 'requestFailed', kind })}
          instanceStatus={
            <InstanceStatus
              idInstance={state.credentials.idInstance}
              instanceState={state.instanceState}
              warnings={state.warnings}
              onDisconnect={disconnect}
            />
          }
        />
      );
  }
}
