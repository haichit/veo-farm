import Link from 'next/link';
import { Workflow, Key, ListChecks, ArrowRight } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientText } from '@/components/ui/GradientText';

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-10 px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          <GradientText>Veo Farm</GradientText>
        </h1>
        <p className="text-sm text-text-muted mt-2">AI video workflow builder</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          href="/workflows"
          icon={Workflow}
          title="Workflows"
          desc="Danh sách workflow đã lưu"
        />
        <Tile
          href="/accounts"
          icon={Key}
          title="Accounts"
          desc="Quản lý cookies AI tools"
        />
        <Tile
          href="/runs"
          icon={ListChecks}
          title="Runs"
          desc="Lịch sử jobs"
        />
      </div>
    </div>
  );
}

function Tile({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="group block">
      <GlassCard className="p-5 transition-all hover:border-accent/40 hover:shadow-accent-glow hover:-translate-y-0.5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-accent-glow flex items-center justify-center text-accent shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-base text-text-primary">{title}</h3>
            <p className="text-xs text-text-muted">{desc}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 group-hover:text-accent transition-all" />
        </div>
      </GlassCard>
    </Link>
  );
}
