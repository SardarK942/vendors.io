import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { AuthCenteredLayout } from '@/components/auth/AuthCenteredLayout';

export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <AuthCenteredLayout>
      <ResetPasswordForm />
    </AuthCenteredLayout>
  );
}
