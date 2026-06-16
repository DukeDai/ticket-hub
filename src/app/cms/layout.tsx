import { requireAdmin } from '@/lib/auth/guard';
import { CmsSidebar } from '@/components/cms/CmsShell';

export const dynamic = 'force-dynamic';

export default async function CmsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex min-h-screen bg-gray-100">
      <CmsSidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
