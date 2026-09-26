import type { InstanceState } from '../green-api/client';
import { describeApiError } from '../ui/errorText';
import type { ConnectionProblem, ConnectionWarning, UsableInstanceState } from './checkInstance';
import type { CredentialsFieldError } from './credentials';

export const INSTANCE_STATE_LABEL: Record<InstanceState, string> = {
  authorized: 'Авторизован',
  notAuthorized: 'Не авторизован',
  blocked: 'Заблокирован',
  starting: 'Запускается',
  suspended: 'Ограничен',
  pendingPassword: 'Ожидает пароль',
};

export const FIELD_ERROR_TEXT: Record<CredentialsFieldError, string> = {
  required: 'Заполните поле.',
  invalidUrl: 'Введите адрес вида https://1234.api.green-api.com.',
  insecureUrl: 'Адрес должен начинаться с https://.',
  invalidInstanceId: 'idInstance состоит только из цифр.',
};

export const WARNING_TEXT: Record<ConnectionWarning, string> = {
  accountSuspended: describeApiError('accountSuspended'),
  outgoingWebhookDisabled:
    'Уведомления о статусах отправленных сообщений выключены, поэтому приложение не узнает о недоставленных сообщениях. Включите их в настройках инстанса.',
};

export function describeConnectionProblem(problem: ConnectionProblem): string {
  switch (problem.type) {
    case 'requestFailed':
      return describeApiError(problem.kind);
    case 'instanceNotReady':
      return describeInstanceNotReady(problem.state);
    case 'webhookUrlConfigured':
      return describeApiError('webhookUrlConfigured');
    case 'incomingWebhookDisabled':
      return 'В настройках инстанса выключены уведомления о входящих сообщениях. Включите «Получать уведомления о входящих сообщениях и файлах» в личном кабинете GREEN-API.';
    case 'unexpectedError':
      return 'Произошла непредвиденная ошибка. Повторите попытку.';
  }
}

export function describeInstanceNotReady(
  state: Exclude<InstanceState, UsableInstanceState>,
): string {
  switch (state) {
    case 'notAuthorized':
      return 'Инстанс не авторизован. Отсканируйте QR-код в личном кабинете GREEN-API.';
    case 'starting':
      return 'Инстанс запускается. Повторите попытку через пару минут.';
    case 'blocked':
      return 'Аккаунт MAX заблокирован.';
    case 'pendingPassword':
      return 'Авторизация не завершена: нужен пароль двухфакторной аутентификации. Завершите вход в личном кабинете GREEN-API.';
  }
}
