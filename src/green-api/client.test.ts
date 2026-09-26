import { incomingTextMessage } from './__fixtures__/notifications';
import { createGreenApiClient, RECEIVE_TIMEOUT_SECONDS, type GreenApiClient } from './client';
import { GreenApiError, type GreenApiErrorKind } from './errors';

const TOKEN = 'd75b3a66374942c5b3c019c698abc2067e151558acbd451234';
const credentials = {
  apiUrl: 'https://3100.api.green-api.com/',
  idInstance: '3100000001',
  apiTokenInstance: TOKEN,
};
const BASE = 'https://3100.api.green-api.com/waInstance3100000001';

const fetchMock = vi.fn<typeof fetch>();

function respond(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  fetchMock.mockResolvedValueOnce(new Response(text, { status }));
}

function lastRequest() {
  const [input, init] = fetchMock.mock.lastCall ?? [];
  return {
    url: input instanceof Request ? input.url : input?.toString(),
    method: init?.method,
    body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
  };
}

async function errorOf(promise: Promise<unknown>): Promise<GreenApiError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof GreenApiError))
    throw new Error(`Expected GreenApiError, got ${String(error)}`);
  return error;
}

let client: GreenApiClient;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  client = createGreenApiClient(credentials);
});

describe('requests', () => {
  it('getStateInstance', async () => {
    respond(200, { stateInstance: 'authorized' });
    await expect(client.getStateInstance()).resolves.toBe('authorized');
    expect(lastRequest()).toEqual({
      url: `${BASE}/getStateInstance/${TOKEN}`,
      method: 'GET',
      body: undefined,
    });
  });

  it('getSettings reduces the settings to what the app checks', async () => {
    respond(200, {
      wid: '79991234567@c.us',
      webhookUrl: '',
      incomingWebhook: 'yes',
      outgoingWebhook: 'no',
      outgoingAPIMessageWebhook: 'yes',
    });
    await expect(client.getSettings()).resolves.toEqual({
      webhookUrlConfigured: false,
      incomingWebhookEnabled: true,
      outgoingWebhookEnabled: false,
    });
    expect(lastRequest()).toMatchObject({ url: `${BASE}/getSettings/${TOKEN}`, method: 'GET' });
  });

  it('getSettings reports a configured webhook URL', async () => {
    respond(200, {
      webhookUrl: 'https://example.com/hook',
      incomingWebhook: 'yes',
      outgoingWebhook: 'yes',
    });
    await expect(client.getSettings()).resolves.toMatchObject({ webhookUrlConfigured: true });
  });

  it('checkAccount sends the phone as a number and returns the chat id', async () => {
    respond(200, { exist: true, chatId: '10000000', fromCache: true });
    await expect(client.checkAccount('79991234567')).resolves.toEqual({
      exists: true,
      chatId: '10000000',
    });
    expect(lastRequest()).toEqual({
      url: `${BASE}/checkAccount/${TOKEN}`,
      method: 'POST',
      body: { phoneNumber: 79991234567 },
    });
  });

  it('checkAccount reports a number without MAX', async () => {
    respond(200, { exist: false, chatId: '', fromCache: false });
    await expect(client.checkAccount('79991234567')).resolves.toEqual({ exists: false });
  });

  it('sendMessage returns the server message id', async () => {
    respond(200, { idMessage: '1763115112345' });
    await expect(client.sendMessage('10000000', 'Привет 😀')).resolves.toBe('1763115112345');
    expect(lastRequest()).toEqual({
      url: `${BASE}/sendMessage/${TOKEN}`,
      method: 'POST',
      body: { chatId: '10000000', message: 'Привет 😀' },
    });
  });

  it('receiveNotification maps the notification and keeps the receipt id', async () => {
    respond(200, { receiptId: 7, body: incomingTextMessage });
    const notification = await client.receiveNotification();
    expect(notification?.receiptId).toBe(7);
    expect(notification?.event).toMatchObject({
      type: 'messageReceived',
      chatId: '10000000',
    });
    expect(lastRequest()).toMatchObject({
      url: `${BASE}/receiveNotification/${TOKEN}?receiveTimeout=${RECEIVE_TIMEOUT_SECONDS}`,
      method: 'GET',
    });
  });

  it('receiveNotification keeps the receipt id of an ignored notification', async () => {
    respond(200, { receiptId: 8, body: { typeWebhook: 'outgoingAPIMessageReceived' } });
    await expect(client.receiveNotification()).resolves.toEqual({ receiptId: 8, event: null });
  });

  it('receiveNotification treats 408 as an empty queue', async () => {
    respond(408, '');
    await expect(client.receiveNotification()).resolves.toBeNull();
  });

  it.each(['', 'null'])(
    'receiveNotification returns null for an empty queue (%j)',
    async (body) => {
      respond(200, body);
      await expect(client.receiveNotification()).resolves.toBeNull();
    },
  );

  it('deleteNotification deletes by receipt id', async () => {
    respond(200, { result: true, reason: '' });
    await expect(client.deleteNotification(7)).resolves.toBe(true);
    expect(lastRequest()).toMatchObject({
      url: `${BASE}/deleteNotification/${TOKEN}/7`,
      method: 'DELETE',
    });
  });

  it('deleteNotification returns false when already deleted', async () => {
    respond(200, { result: false, reason: 'not found' });
    await expect(client.deleteNotification(7)).resolves.toBe(false);

    respond(500, "Cannot read properties of undefined (reading 'findUnAckedMessage')");
    await expect(client.deleteNotification(7)).resolves.toBe(false);
  });
});

describe('invalid responses', () => {
  it.each([
    ['getStateInstance', () => client.getStateInstance(), { stateInstance: 'sleeping' }],
    ['getSettings', () => client.getSettings(), { incomingWebhook: true }],
    ['checkAccount', () => client.checkAccount('79991234567'), { exist: true, chatId: '' }],
    ['sendMessage', () => client.sendMessage('1', 'hi'), {}],
    ['receiveNotification', () => client.receiveNotification(), { receiptId: 'x', body: {} }],
    ['deleteNotification', () => client.deleteNotification(1), { result: 'yes' }],
    ['non-JSON body', () => client.getStateInstance(), '<html>oops</html>'],
    ['empty body', () => client.getStateInstance(), ''],
  ])('rejects %s', async (_case, call, body) => {
    respond(200, body);
    const error = await errorOf(call());
    expect(error.kind).toBe('invalidResponse');
  });
});

describe('errors', () => {
  it.each<[number, string, GreenApiErrorKind]>([
    [400, 'instance is starting or not authorized', 'instanceUnavailable'],
    [
      400,
      'Instance account is expired. Renew your instance from personal area',
      'instanceUnavailable',
    ],
    [
      400,
      'Message cannot be received because custom webhook url is set. Go to cabinet, clear webhook url',
      'webhookUrlConfigured',
    ],
    [400, "Validation failed. Details: 'chatId' is required", 'invalidRequest'],
    [400, 'check phone number timeout limit exceeded', 'server'],
    [400, 'bad phone number, valid 11 or 12 digits', 'invalidRequest'],
    [401, '', 'unauthorized'],
    [403, '', 'instanceNotFound'],
    [403, 'Your account is suspended', 'accountSuspended'],
    [404, '<html>Not Found</html>', 'instanceNotFound'],
    [429, '', 'rateLimited'],
    [466, JSON.stringify({ invokeStatus: { status: 'QUOTE_EXCEEDED' } }), 'quotaExceeded'],
    [469, 'User get contact info limit reached', 'phoneCheckLimit'],
    [502, 'Bad Gateway', 'server'],
    [418, '', 'invalidResponse'],
  ])('maps HTTP %i "%s" to %s', async (status, body, kind) => {
    respond(status, body);
    const error = await errorOf(client.sendMessage('10000000', 'hi'));
    expect(error).toMatchObject({ kind, status });
  });

  it.each<[string, GreenApiErrorKind]>([
    ['instance is starting or not authorized', 'instanceUnavailable'],
    ['User get contact info limit reached', 'phoneCheckLimit'],
  ])('maps checkAccount failure "%s" to %s', async (reason, kind) => {
    respond(200, { status: false, reason });
    const error = await errorOf(client.checkAccount('79991234567'));
    expect(error.kind).toBe(kind);
  });

  it('reports a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const error = await errorOf(client.getStateInstance());
    expect(error).toMatchObject({ kind: 'network', status: null });
  });

  describe('cancellation', () => {
    function hangUntilAborted() {
      fetchMock.mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      );
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it('times out a request that hangs', async () => {
      vi.useFakeTimers();
      hangUntilAborted();
      const pending = errorOf(client.getStateInstance());
      await vi.advanceTimersByTimeAsync(15_000);
      expect((await pending).kind).toBe('timeout');
    });

    it('gives receiveNotification longer than its server timeout', async () => {
      vi.useFakeTimers();
      hangUntilAborted();
      let settled = false;
      const pending = errorOf(client.receiveNotification()).finally(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(RECEIVE_TIMEOUT_SECONDS * 1000);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(10_000);
      expect((await pending).kind).toBe('timeout');
    });

    it('reports cancellation by the caller as aborted', async () => {
      hangUntilAborted();
      const controller = new AbortController();
      const pending = errorOf(client.receiveNotification(controller.signal));
      controller.abort();
      expect((await pending).kind).toBe('aborted');
    });

    it('does not send a request when the signal is already aborted', async () => {
      const error = await errorOf(client.getStateInstance(AbortSignal.abort()));
      expect(error.kind).toBe('aborted');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('rejects an invalid apiUrl without leaking the token', async () => {
    const badClient = createGreenApiClient({ ...credentials, apiUrl: 'not a url' });
    const error = await errorOf(badClient.getStateInstance());
    expect(error.kind).toBe('invalidRequest');
    expect(JSON.stringify(error) + error.message).not.toContain(TOKEN);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never exposes the API token', async () => {
    respond(400, `Bad request for /waInstance3100000001/sendMessage/${TOKEN}`);
    const error = await errorOf(client.sendMessage('10000000', 'hi'));

    expect(error.message).not.toContain(TOKEN);
    expect(error.details).not.toContain(TOKEN);
    expect(error.details).toContain('***');
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });
});
