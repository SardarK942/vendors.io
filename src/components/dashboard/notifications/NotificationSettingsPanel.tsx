'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bell,
  CalendarCheck,
  MessageSquare,
  Store,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface SettingRow {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  defaultOn: boolean;
}

const SETTINGS: readonly SettingRow[] = [
  {
    id: 'booking',
    icon: CalendarCheck,
    title: 'Booking updates',
    description: 'Confirmations, changes, cancellations',
    defaultOn: true,
  },
  {
    id: 'messages',
    icon: MessageSquare,
    title: 'Messages',
    description: 'New messages from couples',
    defaultOn: true,
  },
  {
    id: 'vendor',
    icon: Store,
    title: 'Vendor updates',
    description: 'Availability, pricing, new services',
    defaultOn: true,
  },
  {
    id: 'reminders',
    icon: Bell,
    title: 'Event reminders',
    description: 'Upcoming events and deadlines',
    defaultOn: true,
  },
  {
    id: 'promotions',
    icon: Tag,
    title: 'Promotions & offers',
    description: 'Special deals and discounts',
    defaultOn: false,
  },
];

/**
 * Right-rail notification preferences panel. STUB: the toggles are inert local
 * state only — none of these persist yet.
 * TODO(backend): notification preferences — wire these toggles to a per-user
 * preferences table + API; today they do nothing beyond local UI state.
 */
export function NotificationSettingsPanel() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SETTINGS.map((s) => [s.id, s.defaultOn]))
  );

  return (
    <div className="rounded-2xl border border-hairline bg-white p-6">
      <h2 className="text-sm font-semibold text-ink">Notification Settings</h2>
      <p className="mt-0.5 text-xs text-ink-soft">Choose what you want to be notified about.</p>

      <div className="mt-4 space-y-4">
        {SETTINGS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.id} className="flex items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo/10">
                <Icon className="size-4 text-indigo" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{s.title}</p>
                <p className="text-xs text-ink-soft">{s.description}</p>
              </div>
              <Switch
                checked={prefs[s.id]}
                onCheckedChange={(value) => setPrefs((prev) => ({ ...prev, [s.id]: value }))}
                aria-label={s.title}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl bg-haldi/40 p-3">
        <p className="text-xs text-ink-soft">
          You can also manage email notifications from your account settings.
        </p>
        <Link
          href="/dashboard/settings"
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo hover:underline"
        >
          Go to Settings
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
