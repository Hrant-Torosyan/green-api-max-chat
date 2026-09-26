import type { GreenApiErrorKind } from '../green-api/errors';

const API_ERROR_TEXT: Record<GreenApiErrorKind, string> = {
  unauthorized: 'Неверный токен доступа (apiTokenInstance).',
  instanceNotFound: 'Инстанс не найден. Проверьте API URL и idInstance.',
  instanceUnavailable:
    'Инстанс недоступен: он не авторизован, запускается или его срок действия истёк. Проверьте его в личном кабинете GREEN-API.',
  accountSuspended:
    'На аккаунте MAX временные ограничения: писать можно только тем, кто сохранён в контактах.',
  webhookUrlConfigured:
    'В настройках инстанса указан Webhook URL. Очистите его в личном кабинете GREEN-API, иначе приложение не сможет получать сообщения.',
  invalidRequest: 'Сервер отклонил запрос. Проверьте введённые данные.',
  rateLimited: 'Слишком много запросов. Повторите через несколько секунд.',
  quotaExceeded: 'Исчерпан месячный лимит тарифа. Смените тариф в личном кабинете GREEN-API.',
  phoneCheckLimit: 'Превышен лимит проверки номеров. Повторите позже.',
  server: 'Сервер GREEN-API временно недоступен. Повторите попытку позже.',
  network: 'Нет связи с сервером. Проверьте подключение к интернету и API URL.',
  timeout: 'Сервер не ответил вовремя. Повторите попытку.',
  aborted: 'Запрос отменён.',
  invalidResponse: 'Сервер вернул неожиданный ответ. Проверьте API URL.',
};

export function describeApiError(kind: GreenApiErrorKind): string {
  return API_ERROR_TEXT[kind];
}
