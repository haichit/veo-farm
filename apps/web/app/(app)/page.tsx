import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Workflow, Key, ListChecks } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-8 px-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile href="/flows" icon={Workflow} title="Flows" desc="Tạo & sửa workflow video" />
        <Tile href="/accounts" icon={Key} title="Accounts" desc="Quản lý cookies AI tools" />
        <Tile href="/runs" icon={ListChecks} title="Runs" desc="Lịch sử jobs" />
      </div>
    </div>
  );
}

function Tile({ href, icon: Icon, title, desc }: { href: string; icon: any; title: string; desc: string }) {
  return (
    <Link href={href}>
      <Card className="hover:bg-accent transition-colors cursor-pointer">
        <CardHeader>
          <Icon className="h-6 w-6 mb-2 text-primary" />
          <CardTitle>{title}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
