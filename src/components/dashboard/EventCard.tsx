'use client';
import { useState } from 'react';
import Link from 'next/link';
import styles from './EventCard.module.css';
import { countdown } from '@/lib/dashboard/countdown';
import { fmtDate as fmtDateIntl, fmtTime } from '@/lib/intl';

export interface EventCardData {
  eventId: string;
  bookingId: string;
  eventTypeLabel: string;
  eventDate: string;
  eventStartTime: string; // ISO timestamp
  eventEndTime: string; // ISO timestamp
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  status: string;
  vendor: {
    businessName: string;
    category: string;
    portfolioImage: string | null;
  };
}

interface Props {
  data: EventCardData;
}

// Noon-anchored (no `Z`) so the YYYY-MM-DD is interpreted in the viewer's
// timezone — avoids the "off-by-one day" UTC drift on the front of the card.
function fmtDate(iso: string): string {
  return fmtDateIntl(`${iso}T12:00:00`, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTimeRange(startIso: string, endIso: string): string {
  return `${fmtTime(startIso)} – ${fmtTime(endIso)}`;
}

function statusBadge(status: string): { label: string; color: string } {
  if (status === 'deposit_paid' || status === 'completed')
    return { label: 'Confirmed', color: '#34d399' };
  if (status === 'pending') return { label: 'Awaiting vendor', color: '#fbbf24' };
  if (status === 'accepted') return { label: 'Awaiting deposit', color: '#fbbf24' };
  if (status === 'adjusted_quote_sent') return { label: 'Adjusted quote', color: '#60a5fa' };
  if (status === 'adjusted_quote_declined') return { label: 'Re-quote needed', color: '#fb923c' };
  return { label: status, color: '#9ca3af' };
}

const REVEAL_STATUSES = new Set(['deposit_paid', 'completed']);

export function EventCard({ data }: Props) {
  const [flipped, setFlipped] = useState(false);
  const cd = countdown(data.eventDate);
  const isPast = cd === 'Past';
  const fullAddress = REVEAL_STATUSES.has(data.status);
  const addressLine = fullAddress
    ? `${data.addressLine1}, ${data.city}, ${data.state} ${data.postalCode}`
    : `${data.city}, ${data.state}`;
  const sb = statusBadge(data.status);

  return (
    <div className={`${styles.card} ${flipped ? styles.flipped : ''}`}>
      <div className={styles.content}>
        {/* FRONT — real <button> so Enter/Space toggle and SR users hear it */}
        <button
          type="button"
          className={styles.front}
          onClick={() => setFlipped(true)}
          aria-pressed={flipped}
          aria-label={`${data.eventTypeLabel} with ${data.vendor.businessName} on ${fmtDate(data.eventDate)} — ${cd}. Activate to see booking details.`}
          inert={flipped}
        >
          {data.vendor.portfolioImage && (
            // eslint-disable-next-line @next/next/no-img-element -- card is sized via parent + object-fit; width/height attrs reserve a layout box
            <img
              src={data.vendor.portfolioImage}
              alt=""
              width={320}
              height={420}
              loading="lazy"
              className={`${styles.frontImg} outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10`}
              aria-hidden
            />
          )}
          <div className={styles.frontContent}>
            <div className={styles.titleRow}>
              <span className={styles.badge}>{data.eventTypeLabel}</span>
              <span className={styles.badge}>{isPast ? 'Past' : cd}</span>
            </div>
            <div className={styles.description}>
              <p className={styles.vendorName}>{data.vendor.businessName}</p>
              <p className={styles.cardFooter}>{fmtDate(data.eventDate)}</p>
            </div>
          </div>
        </button>

        {/* BACK — non-interactive container; Link is the primary action */}
        <div className={styles.back} inert={!flipped}>
          <div className={styles.backContent}>
            <p style={{ fontSize: '16px', fontWeight: 700 }}>{data.eventTypeLabel}</p>
            <p style={{ fontSize: '12px' }}>
              {fmtTimeRange(data.eventStartTime, data.eventEndTime)}
            </p>
            <p style={{ fontSize: '11px', opacity: 0.8 }}>{addressLine}</p>
            <p style={{ fontSize: '11px' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: sb.color,
                  marginRight: 6,
                }}
              />
              {sb.label}
            </p>
            <Link
              href={`/dashboard/bookings/${data.bookingId}`}
              style={{ color: '#ff9966', fontSize: '11px', textDecoration: 'underline' }}
            >
              Open booking →
            </Link>
            <button
              type="button"
              onClick={() => setFlipped(false)}
              style={{
                marginTop: 8,
                fontSize: '11px',
                color: 'rgba(255,255,255,0.7)',
                textDecoration: 'underline',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                alignSelf: 'flex-start',
              }}
            >
              ← Back to card
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
