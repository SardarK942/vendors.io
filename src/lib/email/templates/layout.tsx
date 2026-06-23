// src/lib/email/templates/layout.tsx
import * as React from 'react';
import { Body, Container, Head, Html, Img, Link, Section, Text } from '@react-email/components';

interface BaazarEmailLayoutProps {
  preview: string;
  children: React.ReactNode;
  unsubscribeToken: string;
}

const INK = '#1B1414';
const CREAM = '#FBF6EC';

export function BaazarEmailLayout({
  preview,
  children,
  unsubscribeToken,
}: BaazarEmailLayoutProps): React.JSX.Element {
  return (
    <Html>
      <Head>
        <title>{preview}</title>
      </Head>
      <Body
        style={{
          backgroundColor: CREAM,
          fontFamily: 'Schibsted Grotesk, sans-serif',
          margin: 0,
        }}
      >
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
          <Section style={{ textAlign: 'center', marginBottom: 32 }}>
            <Img src="https://www.baazar.io/wordmark.png" alt="Baazar" width="140" height="40" />
          </Section>
          {children}
          <Section
            style={{
              marginTop: 48,
              fontSize: 12,
              color: INK,
              opacity: 0.6,
              textAlign: 'center',
            }}
          >
            <Text>Reply to this email — we read every one.</Text>
            <Text>Baazar.io · Chicago, IL</Text>
            <Link href={`https://www.baazar.io/unsubscribe?token=${unsubscribeToken}`}>
              Unsubscribe
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
