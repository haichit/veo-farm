import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { TopNav } from '@/components/layout/TopNav';
import { UpdatedBanner } from '@/components/layout/UpdatedBanner';
import { DesktopUserBridge } from '@/components/layout/DesktopUserBridge';
import { BackgroundEffects } from '@/components/ui/BackgroundEffects';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="h-screen flex flex-col relative">
      <BackgroundEffects />
      <DesktopUserBridge userId={user.id} />
      <UpdatedBanner />
      <TopNav email={user.email ?? ''} />
      <main className="flex-1 overflow-auto relative z-10">{children}</main>
    </div>
  );
}
