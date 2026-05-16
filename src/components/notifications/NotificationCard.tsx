// TEMP STUB — F3 owns this; will be overwritten on merge.
import type { Database } from '@/types/database.types';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

interface Props {
  notification: NotificationRow;
  onClick?: () => void;
}

export function NotificationCard({ notification, onClick }: Props) {
  return (
    <div
      className="cursor-pointer px-4 py-3 hover:bg-muted/50"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {notification.title}
    </div>
  );
}
