import {
  useId,
  useLayoutEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { MAX_MESSAGE_LENGTH, validateMessageText } from '../chat/messageText';
import styles from './Composer.module.css';

interface ComposerProps {
  onSend: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

const COUNTER_THRESHOLD = MAX_MESSAGE_LENGTH - 500;

export function Composer({ onSend, inputRef }: ComposerProps) {
  const [text, setText] = useState('');
  const counterId = useId();
  const validation = validateMessageText(text);
  const tooLong = !validation.ok && validation.error === 'tooLong';

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [inputRef, text]);

  function submit() {
    if (!validation.ok) return;
    onSend(text);
    setText('');
    inputRef.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  }

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <textarea
        ref={inputRef}
        className={styles.input}
        rows={1}
        aria-label="Сообщение"
        placeholder="Сообщение"
        aria-invalid={tooLong || undefined}
        aria-describedby={text.length > COUNTER_THRESHOLD ? counterId : undefined}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        type="submit"
        className={styles.send}
        disabled={!validation.ok}
        aria-label="Отправить"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M12 19V5M5.5 11.5 12 5l6.5 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {text.length > COUNTER_THRESHOLD && (
        <p id={counterId} className={tooLong ? styles.counterError : styles.counter}>
          {tooLong
            ? `Сообщение длиннее ${MAX_MESSAGE_LENGTH} символов: ${text.length}`
            : `${text.length} / ${MAX_MESSAGE_LENGTH}`}
        </p>
      )}
    </form>
  );
}
