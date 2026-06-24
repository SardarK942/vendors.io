// src/lib/email/templates/vendor-welcome.tsx
import * as React from 'react';
import { Button, Heading, Link, Section, Text } from '@react-email/components';
import { BaazarEmailLayout } from './layout';

interface Props {
  businessName: string;
  profileSlug: string;
  unsubscribeToken: string;
}

const INK = '#1B1414';
const CREAM = '#FBF6EC';

export function VendorWelcomeTemplate({
  businessName,
  profileSlug,
  unsubscribeToken,
}: Props): React.JSX.Element {
  const profileUrl = `https://www.baazar.io/vendors/${profileSlug}`;
  return (
    <BaazarEmailLayout preview="Your Baazar profile is live" unsubscribeToken={unsubscribeToken}>
      <Heading
        style={{ color: INK, fontSize: 28, marginBottom: 16, fontFamily: 'Spectral, serif' }}
      >
        {`Welcome to Baazar, ${businessName}.`}
      </Heading>

      <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
        Your public profile is live at{' '}
        <Link href={profileUrl}>baazar.io/vendors/{profileSlug}</Link>. Couples can find you and
        send booking requests starting now.
      </Text>

      <Heading
        as="h2"
        style={{ color: INK, fontSize: 18, marginBottom: 8, fontFamily: 'Spectral, serif' }}
      >
        Here&apos;s how it works:
      </Heading>

      <Section style={{ marginBottom: 32, paddingLeft: 16 }}>
        <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6 }}>
          1. Couples discover your profile through search
        </Text>
        <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6 }}>
          2. They request a booking with their event details
        </Text>
        <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6 }}>
          3. You accept, they pay a 5% deposit, you handle the 95% balance directly
        </Text>
      </Section>

      <Section style={{ textAlign: 'center', marginTop: 32 }}>
        <Button
          href="https://www.baazar.io/dashboard/profile/packages"
          style={{
            backgroundColor: INK,
            color: CREAM,
            padding: '12px 24px',
            borderRadius: 6,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Add your first package →
        </Button>
      </Section>
    </BaazarEmailLayout>
  );
}
