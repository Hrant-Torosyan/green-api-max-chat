export function warnInDev(message: string, detail?: unknown): void {
  if (import.meta.env.DEV) console.warn(message, detail);
}
