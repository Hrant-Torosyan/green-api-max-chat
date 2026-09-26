const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function isToday(date: Date): boolean {
  return date.toDateString() === new Date().toDateString();
}

export function formatMessageTime(sentAt: number): string {
  const date = new Date(sentAt);
  return (isToday(date) ? timeFormat : dateTimeFormat).format(date);
}

export function formatChatListTime(sentAt: number): string {
  const date = new Date(sentAt);
  return (isToday(date) ? timeFormat : dateFormat).format(date);
}
