export const MAX_MESSAGE_LENGTH = 4000;

type MessageTextValidation = { ok: true } | { ok: false; error: 'empty' | 'tooLong' };

// The text is sent as typed, so its full length counts, in UTF-16 units like the API (emoji = 2).
export function validateMessageText(text: string): MessageTextValidation {
  if (text.trim() === '') return { ok: false, error: 'empty' };
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, error: 'tooLong' };
  return { ok: true };
}
