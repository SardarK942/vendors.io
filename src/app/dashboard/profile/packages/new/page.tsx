import { PackageEditorForm } from '@/components/forms/PackageEditorForm';

export const dynamic = 'force-dynamic';

export default function NewPackagePage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Add Package</h1>
      <PackageEditorForm mode="create" />
    </div>
  );
}
