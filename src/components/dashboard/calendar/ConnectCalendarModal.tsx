// src/components/dashboard/calendar/ConnectCalendarModal.tsx
'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { GoogleCalIcon, AppleCalIcon, OutlookCalIcon } from './CalendarProviderIcons';
import {
  buildGoogleSubscribeUrl,
  buildAppleWebcalUrl,
  buildOutlookSubscribeUrl,
} from '@/lib/calendar-feed/deep-links';

type IntentMethod = 'google' | 'apple' | 'outlook' | 'copy';

interface Props {
  open: boolean;
  onClose: () => void;
  feedUrl: string;
  onIntent: (method: IntentMethod) => void;
}

export function ConnectCalendarModal({ open, onClose, feedUrl, onIntent }: Props) {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
    } catch {}
    setCopied(true);
    onIntent('copy');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-[8vh] z-50 w-[min(560px,92vw)] -translate-x-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between px-6 pt-5">
            <Dialog.Title className="font-display text-xl font-semibold tracking-tight">
              Choose your calendar app
            </Dialog.Title>
            <Dialog.Close className="hover:bg-cream-2 rounded-md px-2 py-1 text-xl text-ink/60">
              ×
            </Dialog.Close>
          </div>
          <div className="px-6 pb-6 pt-3">
            <p className="mb-4 text-sm text-ink/70">
              Tap your calendar — we&apos;ll open it and pre-fill the subscription. No password
              sharing, no app to install.
            </p>

            <ProviderRow
              href={buildGoogleSubscribeUrl(feedUrl)}
              icon={<GoogleCalIcon />}
              name="Google Calendar"
              desc="Most popular. One tap to subscribe."
              onClick={() => onIntent('google')}
            />
            <ProviderRow
              href={buildAppleWebcalUrl(feedUrl)}
              icon={<AppleCalIcon />}
              name={
                <>
                  Apple Calendar <span className="text-xs text-ink/60">· iPhone, iPad, Mac</span>
                </>
              }
              desc="Opens the Calendar app to confirm."
              onClick={() => onIntent('apple')}
            />
            <ProviderRow
              href={buildOutlookSubscribeUrl(feedUrl, 'Baazar Bookings')}
              icon={<OutlookCalIcon />}
              name={
                <>
                  Outlook <span className="text-xs text-ink/60">· Microsoft 365, Outlook.com</span>
                </>
              }
              desc="Subscribes via Outlook's calendar add-by-URL."
              onClick={() => onIntent('outlook')}
            />

            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-ink/60">
              <div className="h-px flex-1 bg-ink/10" />
              Other calendar app
              <div className="h-px flex-1 bg-ink/10" />
            </div>

            <p className="mb-2 text-sm text-ink/70">
              Copy this private URL and paste it into your calendar app&apos;s &ldquo;Subscribe to
              calendar&rdquo; or &ldquo;Add by URL&rdquo; setting:
            </p>
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-cream px-3 py-2.5">
              <code className="flex-1 truncate font-mono text-xs text-ink/70">{feedUrl}</code>
              <button
                onClick={copyUrl}
                className="hover:bg-cream-2 rounded-md border border-ink/10 px-3 py-1.5 text-sm font-semibold"
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-ink/60">
              Works with HoneyBook, Calendly, Tave, Notion, Yahoo, Proton, and any app that supports
              calendar feeds.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ProviderRow({
  href,
  icon,
  name,
  desc,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  name: React.ReactNode;
  desc: string;
  onClick: () => void;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="mb-2.5 flex items-center gap-3 rounded-xl border border-ink/10 p-3.5 text-ink no-underline transition-colors hover:border-ink/20 hover:bg-cream"
    >
      <div className="h-10 w-10 flex-shrink-0">{icon}</div>
      <div className="flex-1">
        <div className="text-sm font-semibold">{name}</div>
        <div className="mt-0.5 text-xs text-ink/60">{desc}</div>
      </div>
      <div className="text-sm text-ink/60">Open ↗</div>
    </a>
  );
}
