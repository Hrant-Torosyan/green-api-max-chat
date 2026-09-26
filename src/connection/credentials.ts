import type { GreenApiCredentials } from '../green-api/client';

export type CredentialsField = keyof GreenApiCredentials;
export type CredentialsFieldError = 'required' | 'invalidUrl' | 'insecureUrl' | 'invalidInstanceId';
export type CredentialsErrors = Partial<Record<CredentialsField, CredentialsFieldError>>;

type CredentialsParseResult =
  { ok: true; credentials: GreenApiCredentials } | { ok: false; errors: CredentialsErrors };

export function parseCredentials(input: GreenApiCredentials): CredentialsParseResult {
  const credentials: GreenApiCredentials = {
    apiUrl: input.apiUrl.trim().replace(/\/+$/, ''),
    idInstance: input.idInstance.trim(),
    apiTokenInstance: input.apiTokenInstance.trim(),
  };

  const errors: CredentialsErrors = {};
  const apiUrlError = checkApiUrl(credentials.apiUrl);
  if (apiUrlError) errors.apiUrl = apiUrlError;

  if (credentials.idInstance === '') errors.idInstance = 'required';
  else if (!/^\d+$/.test(credentials.idInstance)) errors.idInstance = 'invalidInstanceId';

  if (credentials.apiTokenInstance === '') errors.apiTokenInstance = 'required';

  return Object.keys(errors).length === 0 ? { ok: true, credentials } : { ok: false, errors };
}

function checkApiUrl(value: string): CredentialsFieldError | null {
  if (value === '') return 'required';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'invalidUrl';
  }
  return url.protocol === 'https:' ? null : 'insecureUrl';
}
