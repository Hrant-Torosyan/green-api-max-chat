import type { InstanceState } from '../green-api/client';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import type { ConnectionWarning } from './checkInstance';
import { describeInstanceNotReady, INSTANCE_STATE_LABEL, WARNING_TEXT } from './connectionText';
import styles from './InstanceStatus.module.css';

interface InstanceStatusProps {
  idInstance: string;
  instanceState: InstanceState;
  warnings: ConnectionWarning[];
  onDisconnect: () => void;
}

export function InstanceStatus({
  idInstance,
  instanceState,
  warnings,
  onDisconnect,
}: InstanceStatusProps) {
  return (
    <section className={styles.status} aria-label="Инстанс GREEN-API">
      <div className={styles.row}>
        <div>
          <p className={styles.id}>Инстанс {idInstance}</p>
          <p className={styles.state}>
            <span
              className={[styles.dot, instanceState === 'authorized' ? styles.ok : styles.attention]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            />
            {INSTANCE_STATE_LABEL[instanceState]}
          </p>
        </div>
        <Button variant="secondary" onClick={onDisconnect}>
          Отключиться
        </Button>
      </div>
      {instanceState !== 'authorized' && instanceState !== 'suspended' && (
        <Alert tone="warning">{describeInstanceNotReady(instanceState)}</Alert>
      )}
      {warnings.map((warning) => (
        <Alert key={warning} tone="warning">
          {WARNING_TEXT[warning]}
        </Alert>
      ))}
    </section>
  );
}
