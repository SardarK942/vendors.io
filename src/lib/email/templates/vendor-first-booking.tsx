// src/lib/email/templates/vendor-first-booking.tsx
import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { BaazarEmailLayout } from './layout';

interface Props {
  customerFirstName: string;
  eventType: string;
  eventDate: string;
  totalCents: number;
  depositCents: number;
  packageName: string;
  responseSlaHours: number;
  bookingId: string;
  unsubscribeToken: string;
}

const INK = '#1B1414';
const CREAM = '#FBF6EC';

function formatUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function VendorFirstBookingTemplate(props: Props): React.JSX.Element {
  const {
    customerFirstName,
    eventType,
    eventDate,
    totalCents,
    depositCents,
    packageName,
    responseSlaHours,
    bookingId,
    unsubscribeToken,
  } = props;

  return (
    <BaazarEmailLayout
      preview="Your first Baazar booking is here 🎉"
      unsubscribeToken={unsubscribeToken}
    >
      <Heading
        style={{ color: INK, fontSize: 28, marginBottom: 16, fontFamily: 'Spectral, serif' }}
      >
        Congratulations — you&apos;ve got your first request.
      </Heading>

      <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
        {`${customerFirstName} wants to book you for their ${eventType} on ${eventDate}.`}
      </Text>

      <Section
        style={{
          border: `1px solid ${INK}`,
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          backgroundColor: CREAM,
        }}
      >
        <Text style={{ color: INK, fontSize: 13, marginBottom: 4 }}>
          <strong>Package:</strong> {packageName}
        </Text>
        <Text style={{ color: INK, fontSize: 13, marginBottom: 4 }}>
          <strong>Total:</strong> {formatUSD(totalCents)}
        </Text>
        <Text style={{ color: INK, fontSize: 13 }}>
          <strong>5% deposit:</strong> {formatUSD(depositCents)}
        </Text>
      </Section>

      <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6, marginBottom: 32 }}>
        Respond within {responseSlaHours} hours to keep your placement on the marketplace.
      </Text>

      <Section style={{ textAlign: 'center' }}>
        <Button
          href={`https://www.baazar.io/dashboard/bookings/${bookingId}`}
          style={{
            backgroundColor: INK,
            color: CREAM,
            padding: '12px 24px',
            borderRadius: 6,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Respond now →
        </Button>
      </Section>
    </BaazarEmailLayout>
  );
}
