import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { BaazarEmailLayout } from './layout';

interface Props {
  unsubscribeToken: string;
}

const INK = '#1B1414';
const CREAM = '#FBF6EC';

/**
 * Segment B, step 1 — friendly reminder for a confirmed vendor who signed up
 * but never published. Timing-agnostic copy (never says "24 hours"), since a
 * nudge may land for a vendor who signed up long ago.
 */
export function VendorOnboardingNudge1Template({ unsubscribeToken }: Props): React.JSX.Element {
  return (
    <BaazarEmailLayout
      preview="Your Baazar profile isn't live yet — finish setting up"
      unsubscribeToken={unsubscribeToken}
    >
      <Heading
        style={{ color: INK, fontSize: 24, marginBottom: 16, fontFamily: 'Spectral, serif' }}
      >
        Your profile isn&rsquo;t live yet
      </Heading>

      <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
        You started your Baazar vendor profile but haven&rsquo;t published it, so couples
        can&rsquo;t find or book you yet. It only takes a few minutes to finish.
      </Text>

      <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
        Couples across Chicago are searching for culturally-focused wedding vendors right now.
        Finish your setup to start getting booking requests.
      </Text>

      <Section style={{ textAlign: 'center', marginTop: 32 }}>
        <Button
          href="https://www.baazar.io/dashboard/profile/setup"
          style={{
            backgroundColor: INK,
            color: CREAM,
            padding: '12px 24px',
            borderRadius: 6,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Finish your profile →
        </Button>
      </Section>
    </BaazarEmailLayout>
  );
}
