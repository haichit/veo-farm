import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-bold">404 — Không tìm thấy</h1>
        <Link href="/" className="text-sm underline">
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
