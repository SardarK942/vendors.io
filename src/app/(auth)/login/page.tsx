import { LoginForm } from '@/components/auth/LoginForm';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <AuthSplitLayout variant="login">
      <LoginForm />
    </AuthSplitLayout>
  );
}
