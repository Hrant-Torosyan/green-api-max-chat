import { useState, type FormEvent } from 'react';
import { parsePhoneNumber, type PhoneParseResult } from '../chat/phone';
import { Button } from '../ui/Button';
import { describeApiError } from '../ui/errorText';
import { TextField } from '../ui/TextField';
import type { OpenChatProblem, OpenChatResult } from './useOpenChat';
import styles from './NewChatForm.module.css';

interface NewChatFormProps {
  onOpenChat: (phone: string) => Promise<OpenChatResult>;
}

const PHONE_ERROR_TEXT: Record<Extract<PhoneParseResult, { ok: false }>['error'], string> = {
  empty: 'Введите номер телефона.',
  invalidFormat: 'Проверьте номер, например +7 999 123-45-67.',
  unsupportedCountry: 'Поддерживаются только номера России (+7) и Беларуси (+375).',
};

export function NewChatForm({ onOpenChat }: NewChatFormProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [opening, setOpening] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (opening) return;

    const parsed = parsePhoneNumber(value);
    if (!parsed.ok) {
      setError(PHONE_ERROR_TEXT[parsed.error]);
      return;
    }

    setOpening(true);
    setError(undefined);
    const result = await onOpenChat(parsed.phone);
    setOpening(false);

    if (result.ok) setValue('');
    else setError(describeOpenChatProblem(result.problem));
  }

  return (
    <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
      <TextField
        label="Новый чат"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="+7 999 123-45-67"
        readOnly={opening}
        value={value}
        error={error}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="submit" busy={opening}>
        {opening ? 'Поиск…' : 'Открыть'}
      </Button>
    </form>
  );
}

function describeOpenChatProblem(problem: OpenChatProblem): string {
  switch (problem.type) {
    case 'noAccount':
      return 'У этого номера нет аккаунта MAX.';
    case 'requestFailed':
      return problem.kind === 'invalidRequest'
        ? 'Сервер не принял номер. Проверьте его.'
        : describeApiError(problem.kind);
    case 'unexpectedError':
      return 'Произошла непредвиденная ошибка. Повторите попытку.';
  }
}
