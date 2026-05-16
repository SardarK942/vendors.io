// TEMP STUB — B4.5 owns the real implementation; this prevents StepBasics from breaking typecheck.
'use client';
interface Props {
  businessName: string;
  category: string;
  currentBio: string;
  onAccept: (text: string) => void;
}
export function BioAssistButton(_props: Props) {
  return null; // No-op until B4.5 lands
}
