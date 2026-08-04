import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { AuthCenteredLayout } from '@/components/auth/AuthCenteredLayout';

export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <AuthCenteredLayout>
      <ForgotPasswordForm />
    </AuthCenteredLayout>
  );
}
