import type { ThreadMessage } from '@/lib/data/employee';
import { formatDateTime } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';

/**
 * One conversation, shared by the employee app and the office dashboard so both
 * sides read the same thing. `mine` is decided in the database from the caller's
 * own membership, not from anything the page passes in.
 */
export function MessageThreadView({ messages, locale }: { messages: ThreadMessage[]; locale: Locale }) {
  if (messages.length === 0) return <p className="text-sm text-muted-foreground">{t(locale, 'emp.messages.empty')}</p>;
  return (
    <ol className="space-y-3">
      {messages.map((message) => (
        <li
          key={message.id}
          className={`max-w-[85%] rounded-lg p-3 ${
            message.mine ? 'ms-auto bg-primary-soft text-foreground' : 'me-auto bg-muted text-foreground'
          }`}
        >
          <p className="text-xs font-semibold text-muted-foreground">
            {message.mine ? t(locale, 'emp.messages.you') : message.sender_name || t(locale, 'emp.messages.office')}
          </p>
          <p className="break-anywhere mt-1 whitespace-pre-wrap text-sm">{message.body}</p>
          <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">{formatDateTime(locale, message.created_at)}</p>
        </li>
      ))}
    </ol>
  );
}
