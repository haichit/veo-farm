import { Ban } from 'lucide-react';

export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="max-w-md text-center p-10 rounded-2xl border border-error/30 bg-error-bg">
        <Ban className="w-12 h-12 mx-auto text-error mb-4" />
        <h1 className="text-2xl font-bold text-error mb-2">Tài khoản bị khoá</h1>
        <p className="text-text-secondary text-sm">
          Tài khoản của bạn đã bị tạm khoá. Liên hệ admin để được hỗ trợ.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/10 hover:bg-white/15 text-text-primary"
          >
            Đăng xuất
          </button>
        </form>
      </div>
    </div>
  );
}
