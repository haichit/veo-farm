# Veo Farm — Desktop (Electron)

Đóng gói Veo Farm thành file `.exe` chạy Windows + auto-update.

## Cấu trúc

```
apps/desktop/
├── src/main.ts            # Electron main: spawn web + worker, manage lifecycle, auto-update
├── tsconfig.json
├── package.json           # electron-builder config nằm trong "build" key
├── build/icon.ico         # ⚠ tự thay icon; nếu thiếu sẽ dùng default Electron
└── vendor/ffmpeg/         # ffmpeg.exe — CI tự download, dev tự copy nếu test local
```

## Build local (macOS — chỉ test compile, KHÔNG xuất exe Windows)

```bash
pnpm --filter @veo-farm/desktop build         # tsc + Next standalone + worker dist
pnpm --filter @veo-farm/desktop start         # chạy Electron với build local
```

## Build exe Windows (cần CI hoặc máy Win thật)

```bash
# Trên Windows:
pnpm install
pnpm --filter @veo-farm/desktop dist          # → apps/desktop/release/Veo-Farm-Setup-x.y.z.exe
```

CI (GitHub Actions) tự động khi mày push tag `v*`:

```bash
git tag v0.1.0
git push --tags
# → workflow .github/workflows/release.yml build + upload exe vào Release
```

## Auto-update flow

1. App đã cài bản v0.1.0 trên máy user.
2. Mày push tag `v0.1.1` → CI build exe mới + upload vào GitHub Release.
3. App user check update (1h/lần) → thấy v0.1.1 → tự download nền.
4. Khi tải xong → popup "Restart để cập nhật?" → user bấm OK → app tự cài lại.

## Yêu cầu trước khi release lần đầu

1. **Sửa publish config** trong `apps/desktop/package.json`: thay `REPLACE_WITH_YOUR_GITHUB_USER` bằng GitHub username thật.
2. **Tạo GitHub repo** (private hay public đều OK).
3. **Set secrets** trên GitHub repo Settings → Secrets:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Icon**: tạo `build/icon.ico` (256x256 multi-res ICO).
5. Push tag `v0.1.0` để trigger build đầu tiên.

## Brave Browser

Veo Farm cần Brave để render video. Electron tự detect path:
- `C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe`
- `C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe`
- `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe`

Không tìm thấy → app prompt user mở `brave.com/download`.

## Code signing

Hiện SKIP (theo quyết định của user). User sẽ thấy cảnh báo Windows SmartScreen
"Unknown publisher, file dangerous" lần đầu chạy → bấm **More info → Run anyway**.

Khi nào muốn ký:
- Mua EV Code Signing cert (~$300-500/năm) hoặc Standard ($100/năm)
- Thêm `signingHashAlgorithms` + `certificateFile` + `certificatePassword` vào `build.win` config
