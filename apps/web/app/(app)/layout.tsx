import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOut, LayoutDashboard, Workflow, Key, ListChecks } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r bg-muted/40 p-4 flex flex-col gap-1">
        <div className="px-2 pb-4 mb-2 border-b">
          <div className="font-bold text-lg">Veo Farm</div>
          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
        </div>
        <NavItem href="/" icon={LayoutDashboard}>Dashboard</NavItem>
        <NavItem href="/flows" icon={Workflow}>Flows</NavItem>
        <NavItem href="/accounts" icon={Key}>Accounts</NavItem>
        <NavItem href="/runs" icon={ListChecks}>Runs</NavItem>

        <form action="/auth/signout" method="post" className="mt-auto">
          <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

function NavItem({ href, icon: Icon, children }: { href: string; icon: any; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
      <Icon className="h-4 w-4" /> {children}
    </Link>
  );
}
