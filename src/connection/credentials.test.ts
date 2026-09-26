import { parseCredentials } from './credentials';

describe('parseCredentials', () => {
  it('trims values and drops trailing slashes from the API URL', () => {
    expect(
      parseCredentials({
        apiUrl: ' https://1103.api.green-api.com/ ',
        idInstance: ' 1103123456 ',
        apiTokenInstance: ' token ',
      }),
    ).toEqual({
      ok: true,
      credentials: {
        apiUrl: 'https://1103.api.green-api.com',
        idInstance: '1103123456',
        apiTokenInstance: 'token',
      },
    });
  });

  it('reports every missing field', () => {
    expect(parseCredentials({ apiUrl: '', idInstance: ' ', apiTokenInstance: '' })).toEqual({
      ok: false,
      errors: { apiUrl: 'required', idInstance: 'required', apiTokenInstance: 'required' },
    });
  });

  it.each([
    ['1103.api.green-api.com', 'invalidUrl'],
    ['http://1103.api.green-api.com', 'insecureUrl'],
  ])('rejects API URL %s', (apiUrl, error) => {
    expect(parseCredentials({ apiUrl, idInstance: '1103123456', apiTokenInstance: 't' })).toEqual({
      ok: false,
      errors: { apiUrl: error },
    });
  });

  it('rejects a non-numeric idInstance', () => {
    expect(
      parseCredentials({
        apiUrl: 'https://1103.api.green-api.com',
        idInstance: 'waInstance1103',
        apiTokenInstance: 't',
      }),
    ).toEqual({ ok: false, errors: { idInstance: 'invalidInstanceId' } });
  });
});
