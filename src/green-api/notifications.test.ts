import {
  incomingExtendedTextMessage,
  incomingImageMessage,
  incomingTextMessage,
  outgoingApiMessage,
  outgoingMessageStatus,
  quotaExceeded,
  stateInstanceChanged,
} from './__fixtures__/notifications';
import { toInboundEvent } from './notifications';

describe('toInboundEvent', () => {
  it('maps an incoming text message', () => {
    expect(toInboundEvent(incomingTextMessage)).toEqual({
      type: 'messageReceived',
      chatId: '10000000',
      messageId: '1763115112345',
      text: 'Привет от GREEN-API!',
      sentAt: 1763115112000,
      senderName: 'Ходабрыш',
    });
  });

  it('maps a text message with a link, which arrives as extendedTextMessage', () => {
    expect(toInboundEvent(incomingExtendedTextMessage)).toMatchObject({
      type: 'messageReceived',
      messageId: '1763115112346',
      text: 'Документация: https://green-api.com/',
    });
  });

  describe('sender name', () => {
    function senderNameFor(senderData: Record<string, unknown>) {
      const event = toInboundEvent({
        ...incomingTextMessage,
        senderData: { chatId: '10000000', ...senderData },
      });
      return event?.type === 'messageReceived' ? event.senderName : undefined;
    }

    it('prefers the phone book name over the profile name', () => {
      expect(senderNameFor({ senderName: 'Profile', senderContactName: 'Contact' })).toBe(
        'Contact',
      );
    });

    it('falls back to the profile name', () => {
      expect(senderNameFor({ senderName: 'Profile', senderContactName: '' })).toBe('Profile');
    });

    it('is null when both names are empty or missing', () => {
      expect(senderNameFor({ senderName: '  ', senderContactName: '' })).toBeNull();
      expect(senderNameFor({})).toBeNull();
    });
  });

  it.each([
    ['failed', 'notDelivered'],
    ['noAccount', 'noAccount'],
  ])('maps outgoing status %s to a delivery failure', (status, reason) => {
    expect(toInboundEvent(outgoingMessageStatus(status))).toEqual({
      type: 'deliveryFailed',
      chatId: '10000000',
      serverId: '115054445839974415',
      reason,
    });
  });

  it.each(['sent', 'delivered', 'read'])('ignores outgoing status %s', (status) => {
    expect(toInboundEvent(outgoingMessageStatus(status))).toBeNull();
  });

  it('maps an instance state change', () => {
    expect(toInboundEvent(stateInstanceChanged)).toEqual({
      type: 'instanceStateChanged',
      state: 'notAuthorized',
    });
  });

  it('maps an exceeded quota', () => {
    expect(toInboundEvent(quotaExceeded)).toEqual({ type: 'quotaExceeded' });
  });

  it('ignores unsupported notifications without warning', () => {
    const warn = vi.spyOn(console, 'warn');
    expect(toInboundEvent(incomingImageMessage)).toBeNull();
    expect(toInboundEvent(outgoingApiMessage)).toBeNull();
    expect(toInboundEvent({ typeWebhook: 'somethingNew' })).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['not an object', 'text'],
    ['null', null],
    ['no type', { idMessage: '1' }],
    [
      'text message without text',
      { ...incomingTextMessage, messageData: { typeMessage: 'textMessage' } },
    ],
    ['message without chat id', { ...incomingTextMessage, senderData: { senderName: 'Ivan' } }],
    ['timestamp as string', { ...incomingTextMessage, timestamp: '1763115112' }],
    ['status without message id', { ...outgoingMessageStatus('failed'), idMessage: undefined }],
    ['unknown instance state', { ...stateInstanceChanged, stateInstance: 'sleeping' }],
  ])('ignores a malformed notification (%s) and warns in development', (_case, body) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(toInboundEvent(body)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});
