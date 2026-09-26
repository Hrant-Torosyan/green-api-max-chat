import { MAX_MESSAGE_LENGTH, validateMessageText } from './messageText';

describe('validateMessageText', () => {
  it('accepts text with surrounding whitespace and line breaks', () => {
    expect(validateMessageText('  hello\nworld \n')).toEqual({ ok: true });
  });

  it('rejects empty and whitespace-only text', () => {
    expect(validateMessageText('')).toEqual({ ok: false, error: 'empty' });
    expect(validateMessageText(' \n\t ')).toEqual({ ok: false, error: 'empty' });
  });

  it('accepts text at the limit and rejects text above it', () => {
    expect(validateMessageText('a'.repeat(MAX_MESSAGE_LENGTH)).ok).toBe(true);
    expect(validateMessageText('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toEqual({
      ok: false,
      error: 'tooLong',
    });
  });

  it('counts whitespace that will be sent towards the limit', () => {
    expect(validateMessageText(`${'a'.repeat(MAX_MESSAGE_LENGTH)} `)).toEqual({
      ok: false,
      error: 'tooLong',
    });
  });

  it('counts emoji as two units, like the API', () => {
    const emoji = '😀'.repeat(MAX_MESSAGE_LENGTH / 2);
    expect(validateMessageText(emoji).ok).toBe(true);
    expect(validateMessageText(`${emoji}a`)).toEqual({ ok: false, error: 'tooLong' });
  });
});
