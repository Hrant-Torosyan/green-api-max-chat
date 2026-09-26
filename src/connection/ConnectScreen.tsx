import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { GreenApiCredentials } from '../green-api/client';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import type { ConnectionProblem } from './checkInstance';
import { describeConnectionProblem, FIELD_ERROR_TEXT } from './connectionText';
import { parseCredentials, type CredentialsErrors, type CredentialsField } from './credentials';
import styles from './ConnectScreen.module.css';

interface ConnectScreenProps {
  initialCredentials: GreenApiCredentials | null;
  connecting: boolean;
  problem: ConnectionProblem | null;
  onConnect: (credentials: GreenApiCredentials) => void;
}

const EMPTY_CREDENTIALS: GreenApiCredentials = { apiUrl: '', idInstance: '', apiTokenInstance: '' };

export function ConnectScreen({
  initialCredentials,
  connecting,
  problem,
  onConnect,
}: ConnectScreenProps) {
  const [values, setValues] = useState(initialCredentials ?? EMPTY_CREDENTIALS);
  const [errors, setErrors] = useState<CredentialsErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  function update(field: CredentialsField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function errorText(field: CredentialsField) {
    const error = errors[field];
    return error && FIELD_ERROR_TEXT[error];
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (connecting) return;
    const result = parseCredentials(values);
    if (result.ok) {
      setErrors({});
      onConnect(result.credentials);
    } else {
      setErrors(result.errors);
    }
  }

  return (
    <main className={styles.screen}>
      <form ref={formRef} className={styles.card} onSubmit={handleSubmit} noValidate>
        <header className={styles.header}>
          <h1 className={styles.title}>Веб-клиент MAX</h1>
          <p className={styles.subtitle}>
            Подключите инстанс GREEN-API. Все три значения есть на странице инстанса в{' '}
            <a href="https://console.green-api.com" target="_blank" rel="noreferrer">
              личном кабинете
            </a>
            .
          </p>
        </header>

        <div className={styles.fields}>
          <TextField
            label="API URL"
            type="url"
            inputMode="url"
            placeholder="https://1234.api.green-api.com"
            hint="Адрес указан на странице инстанса в личном кабинете GREEN-API."
            autoComplete="off"
            spellCheck={false}
            readOnly={connecting}
            value={values.apiUrl}
            error={errorText('apiUrl')}
            onChange={(event) => update('apiUrl', event.target.value)}
          />
          <TextField
            label="idInstance"
            inputMode="numeric"
            placeholder="1103123456"
            autoComplete="off"
            spellCheck={false}
            readOnly={connecting}
            value={values.idInstance}
            error={errorText('idInstance')}
            onChange={(event) => update('idInstance', event.target.value)}
          />
          <TextField
            label="apiTokenInstance"
            type="password"
            autoComplete="off"
            spellCheck={false}
            readOnly={connecting}
            value={values.apiTokenInstance}
            error={errorText('apiTokenInstance')}
            hint="Токен хранится только в этой вкладке и удаляется при её закрытии."
            onChange={(event) => update('apiTokenInstance', event.target.value)}
          />
        </div>

        {problem && <Alert tone="error">{describeConnectionProblem(problem)}</Alert>}

        <Button type="submit" busy={connecting}>
          {connecting ? 'Подключение…' : 'Подключиться'}
        </Button>
      </form>
    </main>
  );
}
