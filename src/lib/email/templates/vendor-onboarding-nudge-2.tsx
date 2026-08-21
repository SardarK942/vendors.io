import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { BaazarEmailLayout } from './layout';

interface Props {
  unsubscribeToken: string;
}

const INK = '#1B1414';
const CREAM = '#FBF6EC';

/**
 * Segment B, step 2 — last-call reminder (~6 days after step 1) for a confirmed
 * vendor still not live. Timing-agnostic copy.
 */
export function VendorOnboardingNudge2Template({ unsubscribeToken }: Props): React.JSX.Element {
  return (
    <BaazarEmailLayout
      preview="Last reminder — your Baazar profile still isn't live"
      unsubscribeToken={unsubscribeToken}
    >
      <Heading
        style={{ color: INK, fontSize: 24, marginBottom: 16, fontFamily: 'Spectral, serif' }}
      >
        One last nudge
      </Heading>

      <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
        Your Baazar vendor profile still isn&rsquo;t published, so it won&rsquo;t appear in the
        marketplace and couples can&rsquo;t reach you. This is the last reminder we&rsquo;ll send.
      </Text>

      <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
        If you&rsquo;d still like to list your business, you can finish in just a few minutes
        &mdash; it&rsquo;s free, with no monthly or listing fees.
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
