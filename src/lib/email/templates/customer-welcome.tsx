// src/lib/email/templates/customer-welcome.tsx
import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { BaazarEmailLayout } from './layout';

interface Props {
  firstName: string;
  unsubscribeToken: string;
}

const INK = '#1B1414';

export function CustomerWelcomeTemplate({ firstName, unsubscribeToken }: Props): React.JSX.Element {
  return (
    <BaazarEmailLayout
      preview={`Welcome to Baazar, ${firstName}`}
      unsubscribeToken={unsubscribeToken}
    >
      <Heading
        style={{ color: INK, fontSize: 28, marginBottom: 24, fontFamily: 'Spectral, serif' }}
      >
        Welcome to Baazar, {firstName}
      </Heading>

      <Section style={{ marginBottom: 24 }}>
        <Heading as="h2" style={{ color: INK, fontSize: 18, marginBottom: 8 }}>
          Find your vendors
        </Heading>
        <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6 }}>
          Browse 3,000+ culturally-focused wedding and event vendors across photography, mehndi,
          DJs, and more. Heart your favorites to compare side-by-side.
        </Text>
      </Section>

      <Section style={{ marginBottom: 24 }}>
        <Heading as="h2" style={{ color: INK, fontSize: 18, marginBottom: 8 }}>
          Request, don&apos;t commit
        </Heading>
        <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6 }}>
          Send a booking request with your event details. Vendors respond with quotes you can
          accept, counter, or pass on — no charge until you confirm.
        </Text>
      </Section>

      <Section style={{ marginBottom: 32 }}>
        <Heading as="h2" style={{ color: INK, fontSize: 18, marginBottom: 8 }}>
          5% to lock it in
        </Heading>
        <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6 }}>
          Once you&apos;re ready, a 5% deposit secures your date. Pay the remaining 95% directly to
          the vendor per their terms.
        </Text>
      </Section>

      <Section style={{ textAlign: 'center', marginTop: 32 }}>
        <Button
          href="https://www.baazar.io/vendors"
          style={{
            backgroundColor: INK,
            color: '#FBF6EC',
            padding: '12px 24px',
            borderRadius: 6,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Start browsing →
        </Button>
      </Section>
    </BaazarEmailLayout>
  );
}
