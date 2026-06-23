import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { BaazarEmailLayout } from './layout';

interface Props {
  businessName: string;
  unsubscribeToken: string;
}

const INK = '#1B1414';
const CREAM = '#FBF6EC';

export function Vendor48hFollowupTemplate({
  businessName,
  unsubscribeToken,
}: Props): React.JSX.Element {
  return (
    <BaazarEmailLayout
      preview="Tips for getting your first Baazar booking"
      unsubscribeToken={unsubscribeToken}
    >
      <Heading
        style={{ color: INK, fontSize: 24, marginBottom: 16, fontFamily: 'Spectral, serif' }}
      >
        Tips for getting your first Baazar booking
      </Heading>

      <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
        Your profile has been live for 2 days. Here are 3 quick wins to attract your first booking:
      </Text>

      <Section style={{ marginBottom: 32 }}>
        <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
          <strong>Add 5+ portfolio photos</strong> — vendors with full galleries get 4× more
          requests
        </Text>
        <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
          <strong>Set your response time to 4 hours or less</strong> — fast responders convert
          higher
        </Text>
        <Text style={{ color: INK, fontSize: 14, lineHeight: 1.6 }}>
          <strong>Complete your bio with specifics</strong> (style, experience, what makes you
          different)
        </Text>
      </Section>

      <Section style={{ textAlign: 'center', marginTop: 32 }}>
        <Button
          href="https://www.baazar.io/dashboard/profile/setup/basics"
          style={{
            backgroundColor: INK,
            color: CREAM,
            padding: '12px 24px',
            borderRadius: 6,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Edit your profile →
        </Button>
      </Section>
    </BaazarEmailLayout>
  );
}
