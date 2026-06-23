// src/lib/email/templates/customer-followup-48h.tsx
import * as React from 'react';
import { Button, Heading, Img, Link, Section, Text } from '@react-email/components';
import { BaazarEmailLayout } from './layout';

export interface SuggestedVendor {
  name: string;
  slug: string;
  category: string;
  thumbnail_url?: string | null;
}

interface Props {
  hasEvent: boolean;
  eventType: string | null;
  eventDate: string | null;
  daysUntilEvent: number | null;
  suggestedVendors: SuggestedVendor[];
  primaryCategory: string | null;
  unsubscribeToken: string;
}

const INK = '#1B1414';
const CREAM = '#FBF6EC';

export function Customer48hFollowupTemplate(props: Props): React.JSX.Element {
  const {
    hasEvent,
    eventType,
    eventDate,
    daysUntilEvent,
    suggestedVendors,
    primaryCategory,
    unsubscribeToken,
  } = props;

  const heading = hasEvent
    ? `${daysUntilEvent} days until your event — here are vendors to consider`
    : 'Looking for wedding inspiration?';

  const bodyText = hasEvent
    ? `Your ${eventType ?? 'event'} is coming up on ${eventDate}. We've pulled 3 vendors in your area to get you started.`
    : `Take another look — we've added new vendors this week. Here are 3 trending now.`;

  const ctaHref = primaryCategory
    ? `https://www.baazar.io/vendors?category=${primaryCategory}`
    : `https://www.baazar.io/vendors`;

  return (
    <BaazarEmailLayout preview={heading} unsubscribeToken={unsubscribeToken}>
      <Heading
        style={{ color: INK, fontSize: 24, marginBottom: 16, fontFamily: 'Spectral, serif' }}
      >
        {heading}
      </Heading>

      <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6, marginBottom: 32 }}>
        {bodyText}
      </Text>

      {suggestedVendors.map((v) => (
        <Section
          key={v.slug}
          style={{
            border: '1px solid rgba(27,20,20,0.15)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 12,
          }}
        >
          {v.thumbnail_url && (
            <Img
              src={v.thumbnail_url}
              alt={v.name}
              width="100%"
              height="160"
              style={{ borderRadius: 4, marginBottom: 8, objectFit: 'cover' }}
            />
          )}
          <Heading as="h3" style={{ color: INK, fontSize: 16, marginBottom: 4 }}>
            {v.name}
          </Heading>
          <Text style={{ color: INK, fontSize: 13, opacity: 0.7, marginBottom: 8 }}>
            {v.category}
          </Text>
          <Link
            href={`https://www.baazar.io/vendors/${v.slug}`}
            style={{ color: INK, fontSize: 13, fontWeight: 500 }}
          >
            View profile →
          </Link>
        </Section>
      ))}

      <Section style={{ textAlign: 'center', marginTop: 32 }}>
        <Button
          href={ctaHref}
          style={{
            backgroundColor: INK,
            color: CREAM,
            padding: '12px 24px',
            borderRadius: 6,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          See more vendors →
        </Button>
      </Section>
    </BaazarEmailLayout>
  );
}
