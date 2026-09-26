import type { ReactNode } from 'react';
import styles from './Alert.module.css';

interface AlertProps {
  tone: 'error' | 'warning';
  children: ReactNode;
}

export function Alert({ tone, children }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={[styles.alert, styles[tone]].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
