// Payloads follow the examples in the GREEN-API MAX notification format docs.

const instanceData = { idInstance: 3100000000, wid: '79991234567@c.us', typeInstance: 'v3' };

const senderData = {
  chatId: '10000000',
  chatName: 'Ходабрыш Пробешёлов',
  chatType: 'user',
  sender: '10000000',
  senderName: 'Ходабрыш Пробешёлов',
  senderType: 'user',
  senderContactName: 'Ходабрыш',
  senderPhoneNumber: 79876543210,
};

export const incomingTextMessage = {
  typeWebhook: 'incomingMessageReceived',
  instanceData,
  timestamp: 1763115112,
  idMessage: '1763115112345',
  senderData,
  messageData: {
    typeMessage: 'textMessage',
    textMessageData: { textMessage: 'Привет от GREEN-API!' },
  },
};

export const incomingExtendedTextMessage = {
  typeWebhook: 'incomingMessageReceived',
  instanceData,
  timestamp: 1763115112,
  idMessage: '1763115112346',
  senderData,
  messageData: {
    typeMessage: 'extendedTextMessage',
    extendedTextMessageData: {
      text: 'Документация: https://green-api.com/',
      description: 'Сервис GREEN-API',
      title: 'GREEN-API',
      forwardingScore: 0,
      isForwarded: false,
    },
  },
};

export const incomingImageMessage = {
  typeWebhook: 'incomingMessageReceived',
  instanceData,
  timestamp: 1763115112,
  idMessage: '1763115112347',
  senderData,
  messageData: {
    typeMessage: 'imageMessage',
    fileMessageData: {
      downloadUrl: 'https://example.com/image.jpg',
      caption: '',
      fileName: 'image.jpg',
      mimeType: 'image/jpeg',
    },
  },
};

export function outgoingMessageStatus(status: string) {
  return {
    typeWebhook: 'outgoingMessageStatus',
    chatId: '10000000',
    instanceData,
    timestamp: 1755591519,
    idMessage: '115054445839974415',
    status,
  };
}

export const outgoingApiMessage = {
  ...incomingTextMessage,
  typeWebhook: 'outgoingAPIMessageReceived',
};

export const stateInstanceChanged = {
  typeWebhook: 'stateInstanceChanged',
  instanceData,
  timestamp: 1755589527,
  stateInstance: 'notAuthorized',
};

export const quotaExceeded = {
  typeWebhook: 'quotaExceeded',
  instanceData,
  timestamp: 1755589527,
  quotaData: {
    method: 'correspondents',
    used: 3,
    total: 3,
    status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
    description: 'Monthly quota has been exceeded.',
  },
};
