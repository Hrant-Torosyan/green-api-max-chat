export type PhoneParseResult =
  | { ok: true; phone: string }
  | { ok: false; error: 'empty' | 'invalidFormat' | 'unsupportedCountry' };

const SEPARATORS = /[\s()\-.]/g;
const RUSSIA = /^7\d{10}$/;
const BELARUS = /^375\d{9}$/;

/** A MAX chat can only be looked up by a Russian or Belarusian number. */
export function parsePhoneNumber(input: string): PhoneParseResult {
  const compact = input.replace(SEPARATORS, '');
  if (compact === '') return { ok: false, error: 'empty' };

  const international = compact.startsWith('+');
  const digits = international ? compact.slice(1) : compact;
  if (!/^\d+$/.test(digits)) return { ok: false, error: 'invalidFormat' };

  const phone = international ? digits : fromDomesticFormat(digits);

  if (RUSSIA.test(phone) || BELARUS.test(phone)) return { ok: true, phone };
  if (phone.length < 10 || /^(7|8|375)/.test(phone)) return { ok: false, error: 'invalidFormat' };
  return { ok: false, error: 'unsupportedCountry' };
}

/**
 * Both countries dial domestic numbers with a leading 8: Belarus as 8 0XX (8 029 123-45-67 is
 * +375 29 123-45-67), Russia as 8 XXX (8 999 123-45-67 is +7 999 123-45-67).
 */
function fromDomesticFormat(digits: string): string {
  if (digits.length !== 11 || !digits.startsWith('8')) return digits;
  return digits.startsWith('80') ? `375${digits.slice(2)}` : `7${digits.slice(1)}`;
}

export function formatPhoneNumber(phone: string): string {
  const russia = /^7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  if (russia) return `+7 ${russia[1]} ${russia[2]}-${russia[3]}-${russia[4]}`;

  const belarus = /^375(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  if (belarus) return `+375 ${belarus[1]} ${belarus[2]}-${belarus[3]}-${belarus[4]}`;

  return `+${phone}`;
}
