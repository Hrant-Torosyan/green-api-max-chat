import { formatPhoneNumber, parsePhoneNumber } from './phone';

describe('parsePhoneNumber', () => {
  it.each([
    ['Russian international', '+7 (999) 123-45-67', '79991234567'],
    ['Russian without plus', '79991234567', '79991234567'],
    ['Russian domestic', '8 999 123 45 67', '79991234567'],
    ['Belarusian international', '+375 29 123-45-67', '375291234567'],
    ['Belarusian without plus', '375.29.123.45.67', '375291234567'],
    ['Belarusian domestic', '8 029 123-45-67', '375291234567'],
    ['Belarusian domestic, other operator', '8 (044) 765-43-21', '375447654321'],
  ])('normalizes a %s number', (_case, input, phone) => {
    expect(parsePhoneNumber(input)).toEqual({ ok: true, phone });
  });

  it('rejects empty input', () => {
    expect(parsePhoneNumber('  ')).toEqual({ ok: false, error: 'empty' });
  });

  it.each([
    '+7 999 123 45',
    '799912345678',
    '37529123456',
    '8999123456',
    '8 029 123-45-6',
    '+8 999 123-45-67',
    '12345',
    '+7 999 abc',
  ])('rejects malformed number %s', (input) => {
    expect(parsePhoneNumber(input)).toEqual({ ok: false, error: 'invalidFormat' });
  });

  it.each(['+49 151 23456789', '+1 202 555 0143', '+380 67 123 4567'])(
    'rejects number from an unsupported country %s',
    (input) => {
      expect(parsePhoneNumber(input)).toEqual({ ok: false, error: 'unsupportedCountry' });
    },
  );
});

describe('formatPhoneNumber', () => {
  it('formats Russian and Belarusian numbers', () => {
    expect(formatPhoneNumber('79991234567')).toBe('+7 999 123-45-67');
    expect(formatPhoneNumber('375291234567')).toBe('+375 29 123-45-67');
  });
});
