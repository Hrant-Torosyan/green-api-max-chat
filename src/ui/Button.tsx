import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  /** Ignores clicks while staying focusable, so keyboard focus is not lost. */
  busy?: boolean;
}

export function Button({
  variant = 'primary',
  busy = false,
  className,
  type = 'button',
  onClick,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
      onClick={(event) => {
        if (busy) event.preventDefault();
        else onClick?.(event);
      }}
    />
  );
}
