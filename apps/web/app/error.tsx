'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-bold">Có lỗi xảy ra</h1>
        <p className="text-sm text-muted-foreground break-all">{error.message}</p>
        <button onClick={() => reset()} className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm">
          Thử lại
        </button>
      </div>
    </div>
  );
}
