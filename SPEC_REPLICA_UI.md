# Veo Farm — UI Migration Spec (Section 19)

**Source:** Reverse-engineered design system từ commercial tool VEO3 Flow Automation v1.5.0 (Vietnamese, Electron). UI họ là **dark glass-morphism với purple/pink accent** — modern, đẹp, đáng copy.

**Mục tiêu:** Apply design system của họ sang Veo Farm Next.js app, giữ nguyên architecture (Next.js + React Flow + Tailwind + shadcn/ui) nhưng đổi visual layer.

---

## 19.1 Design tokens (from `public/styles.css` của họ)

### Colors

```css
/* Backgrounds */
--bg-primary:        #0a0a12   /* dark navy, body */
--bg-secondary:      #111120   /* nav, modal bg */
--bg-card:           #161628   /* card background */
--bg-card-hover:     #1c1c38
--bg-input:          #12121f   /* form inputs */
--glass-bg:          rgba(20, 20, 40, 0.85)   /* glass card */

/* Borders */
--border-color:      rgba(255, 255, 255, 0.06)
--glass-border:      rgba(138, 92, 246, 0.15)
--border-focus:      rgba(138, 92, 246, 0.5)

/* Accent (signature purple/pink) */
--accent:            #8a5cf6   /* primary purple */
--accent-hover:      #7c4dff
--accent-glow:       rgba(138, 92, 246, 0.25)
--secondary:         #ec4899   /* pink (gradient pair) */

/* Status */
--success:           #34d399   /* emerald */
--success-bg:        rgba(52, 211, 153, 0.10)
--error:             #ef4444
--error-bg:          rgba(239, 68, 68, 0.10)
--warning:           #fbbf24
--warning-bg:        rgba(251, 191, 36, 0.10)
--info:              #60a5fa

/* Text */
--text-primary:      #f0f0f5
--text-secondary:    #a0a0b8
--text-muted:        #5a5a75
```

### Geometry

```css
--radius:            16px
--radius-sm:         10px
--radius-xs:         6px
--transition:        0.2s ease
--font:              'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
```

### Shadow patterns

```css
/* Glass card (multi-layer glow) */
0 0 0 1px rgba(255, 255, 255, 0.03),
0 20px 80px rgba(0, 0, 0, 0.5),
0 0 40px rgba(138, 92, 246, 0.08)

/* Gradient button hover */
0 8px 32px rgba(138, 92, 246, 0.4)

/* Logo box pulse */
0 8px 32px rgba(138, 92, 246, 0.3) → 0 8px 48px rgba(138, 92, 246, 0.5)
```

### Animations

```css
@keyframes orbFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%      { transform: translate(40px, -30px) scale(1.1); }
  66%      { transform: translate(-30px, 20px) scale(0.95); }
}
/* Apply to .orb { animation: orbFloat 25s ease-in-out infinite; } */

@keyframes cardAppear {
  from { opacity: 0; transform: translateY(20px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes logoPulse {
  0%, 100% { box-shadow: 0 8px 32px rgba(138, 92, 246, 0.3); }
  50%      { box-shadow: 0 8px 48px rgba(138, 92, 246, 0.5); }
}

@keyframes spin { to { transform: rotate(360deg); } }
```

---

## 19.2 Tailwind config update

`apps/web/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        bg: {
          primary: "#0a0a12",
          secondary: "#111120",
          card: "#161628",
          "card-hover": "#1c1c38",
          input: "#12121f"
        },
        glass: {
          DEFAULT: "rgba(20, 20, 40, 0.85)",
          border: "rgba(138, 92, 246, 0.15)"
        },
        // Accent
        accent: {
          DEFAULT: "#8a5cf6",
          hover: "#7c4dff",
          glow: "rgba(138, 92, 246, 0.25)"
        },
        secondary: {
          DEFAULT: "#ec4899"
        },
        // Status (override default)
        success: { DEFAULT: "#34d399", bg: "rgba(52, 211, 153, 0.1)" },
        warning: { DEFAULT: "#fbbf24", bg: "rgba(251, 191, 36, 0.1)" },
        error:   { DEFAULT: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" },
        info:    "#60a5fa",
        // Text
        text: {
          primary: "#f0f0f5",
          secondary: "#a0a0b8",
          muted: "#5a5a75"
        },
        border: {
          DEFAULT: "rgba(255, 255, 255, 0.06)",
          focus: "rgba(138, 92, 246, 0.5)"
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"]
      },
      borderRadius: {
        DEFAULT: "16px",
        sm: "10px",
        xs: "6px"
      },
      boxShadow: {
        glass: "0 0 0 1px rgba(255,255,255,0.03), 0 20px 80px rgba(0,0,0,0.5), 0 0 40px rgba(138,92,246,0.08)",
        "accent-glow": "0 8px 32px rgba(138, 92, 246, 0.3)",
        "accent-glow-lg": "0 8px 48px rgba(138, 92, 246, 0.5)",
        "success-glow": "0 4px 20px rgba(52, 211, 153, 0.3)",
        "error-glow": "0 4px 20px rgba(239, 68, 68, 0.3)"
      },
      animation: {
        "orb-float": "orbFloat 25s ease-in-out infinite",
        "card-appear": "cardAppear 0.6s ease-out",
        "logo-pulse": "logoPulse 3s ease-in-out infinite",
        "spin-slow": "spin 1.5s linear infinite"
      },
      keyframes: {
        orbFloat: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(40px, -30px) scale(1.1)" },
          "66%": { transform: "translate(-30px, 20px) scale(0.95)" }
        },
        cardAppear: {
          from: { opacity: "0", transform: "translateY(20px) scale(0.98)" },
          to:   { opacity: "1", transform: "translateY(0) scale(1)" }
        },
        logoPulse: {
          "0%, 100%": { boxShadow: "0 8px 32px rgba(138, 92, 246, 0.3)" },
          "50%": { boxShadow: "0 8px 48px rgba(138, 92, 246, 0.5)" }
        }
      },
      backdropBlur: {
        "glass": "40px"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
```

---

## 19.3 Inter font setup

`apps/web/app/layout.tsx`:

```typescript
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap"
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body className="bg-bg-primary text-text-primary font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
```

---

## 19.4 Shared components

### `<BackgroundEffects/>` — 3 floating orbs

```typescript
// apps/web/components/ui/BackgroundEffects.tsx
export function BackgroundEffects() {
  return (
    <div className="bg-effects fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="orb absolute rounded-full blur-3xl opacity-15 animate-orb-float
                      w-[500px] h-[500px] -top-52 -left-32"
           style={{ background: "#8a5cf6" }} />
      <div className="orb absolute rounded-full blur-3xl opacity-15 animate-orb-float
                      w-[400px] h-[400px] -bottom-40 -right-32"
           style={{ background: "#ec4899", animationDelay: "-8s" }} />
      <div className="orb absolute rounded-full blur-3xl opacity-15 animate-orb-float
                      w-[350px] h-[350px] top-1/2 left-1/2"
           style={{ background: "#06b6d4", animationDelay: "-16s" }} />
    </div>
  );
}
```

### `<GlassCard/>` — wrapper

```typescript
// apps/web/components/ui/GlassCard.tsx
import { cn } from "@/lib/utils";
import type { ReactNode, HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  appear?: boolean;
}

export function GlassCard({ className, children, appear, ...rest }: GlassCardProps) {
  return (
    <div
      className={cn(
        "bg-glass backdrop-blur-glass border border-glass-border rounded-[24px]",
        "shadow-glass relative overflow-hidden",
        appear && "animate-card-appear",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
```

### `<GradientLogo/>`

```typescript
// apps/web/components/ui/GradientLogo.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GradientLogo({ icon, size = 64, className }: {
  icon: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-[20px]",
        "bg-gradient-to-br from-accent to-secondary",
        "shadow-accent-glow animate-logo-pulse",
        className
      )}
      style={{ width: size, height: size, fontSize: size / 2 }}
    >
      {icon}
    </div>
  );
}
```

### `<GradientText/>`

```typescript
// apps/web/components/ui/GradientText.tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function GradientText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "bg-gradient-to-br from-text-primary to-[#a78bfa]",
        "bg-clip-text text-transparent",
        className
      )}
    >
      {children}
    </span>
  );
}
```

### Button variants update — `apps/web/components/ui/button.tsx`

```typescript
// Variants from shadcn — adjust 3 variants
variants: {
  variant: {
    primary: "bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow hover:shadow-accent-glow-lg hover:-translate-y-0.5",
    success: "bg-gradient-to-br from-success to-[#059669] text-white shadow-success-glow hover:-translate-y-0.5",
    secondary: "bg-white/[0.03] border border-border text-text-secondary hover:bg-white/[0.06] hover:text-text-primary",
    danger: "bg-error-bg border border-error/30 text-error hover:bg-error/15 hover:border-error",
    teal: "bg-gradient-to-br from-[#2dd4bf] to-[#0f766e] text-white shadow-[0_4px_20px_rgba(20,184,166,0.3)]",
    ghost: "text-text-muted hover:text-text-secondary hover:bg-white/[0.06]"
  }
}
```

---

## 19.5 Login page rewrite

`apps/web/app/(auth)/login/page.tsx`:

```typescript
"use client";
import { useState } from "react";
import { Mail, Lock, Eye, EyeOff, LogIn, UserPlus, Rocket } from "lucide-react";
import { BackgroundEffects } from "@/components/ui/BackgroundEffects";
import { GlassCard } from "@/components/ui/GlassCard";
import { GradientLogo } from "@/components/ui/GradientLogo";
import { GradientText } from "@/components/ui/GradientText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: "info"|"success"|"error"; msg: string } | null>(null);

  const supabase = createClient();

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` }
    });
    setLoading(false);
    if (error) setAlert({ type: "error", msg: error.message });
    else setAlert({ type: "success", msg: "📬 Đã gửi link đăng nhập tới " + email });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 relative">
      <BackgroundEffects />

      <div className="w-full max-w-[440px] z-10">
        <GlassCard appear className="p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <GradientLogo icon="🎬" size={64} className="mb-4" />
            <h1 className="text-2xl font-bold tracking-tight mb-1.5">
              <GradientText>Veo Farm</GradientText>
            </h1>
            <p className="text-sm text-text-muted">Đăng nhập để sử dụng tool</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl mb-7 border border-border">
            <button
              onClick={() => setTab("login")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-[10px] text-[13px] font-semibold transition-all
                ${tab === "login"
                  ? "bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow"
                  : "text-text-muted hover:text-text-secondary"}`}
            >
              <LogIn className="w-4 h-4" /> Đăng nhập
            </button>
            <button
              onClick={() => setTab("register")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-[10px] text-[13px] font-semibold transition-all
                ${tab === "register"
                  ? "bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow"
                  : "text-text-muted hover:text-text-secondary"}`}
            >
              <UserPlus className="w-4 h-4" /> Đăng ký
            </button>
          </div>

          {/* Alert */}
          {alert && (
            <Alert className={`mb-4 ${alert.type === "error" ? "bg-error-bg border-error/30 text-error" : alert.type === "success" ? "bg-success-bg border-success/30 text-success" : "bg-info/10 border-info/30 text-info"}`}>
              <AlertDescription>{alert.msg}</AlertDescription>
            </Alert>
          )}

          {/* Form */}
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5 tracking-wide">
                EMAIL
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pl-11 h-12 bg-bg-input border-border focus:border-accent rounded-[10px]"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="w-full h-12 rounded-xl text-sm font-bold gap-2"
            >
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-slow" /> : <Rocket className="w-5 h-5" />}
              Gửi Link Đăng nhập
            </Button>
          </form>
        </GlassCard>

        <div className="text-center mt-6 text-xs text-text-muted">
          Phiên bản 0.1.0 · Veo Farm
        </div>
      </div>
    </div>
  );
}
```

---

## 19.6 Top nav layout

`apps/web/app/(app)/layout.tsx`:

```typescript
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers3, Hub, Plus, Link2, Settings, LogOut, User } from "lucide-react";
import { BackgroundEffects } from "@/components/ui/BackgroundEffects";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  const tabs = [
    { href: "/flows", label: "Flows", icon: Layers3 },
    { href: "/canvas", label: "Builder", icon: Hub },
    { href: "/runs", label: "Runs", icon: Plus }
  ];

  return (
    <div className="h-screen flex flex-col relative">
      <BackgroundEffects />

      {/* Top Nav */}
      <nav className="h-12 px-4 flex items-center justify-between
                      bg-[rgba(17,17,32,0.85)] backdrop-blur-xl
                      border-b border-border z-50 relative">
        <div className="flex items-center gap-1.5">
          <span className="text-xl">🎬</span>
          <span className="text-sm font-bold tracking-tight bg-gradient-to-br from-text-primary to-[#a78bfa] bg-clip-text text-transparent">
            Veo Farm
          </span>
          <div className="w-px h-5 bg-border mx-2" />

          {tabs.map(tab => {
            const active = path?.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${active
                    ? "bg-accent-glow border border-glass-border text-text-primary"
                    : "text-text-muted hover:text-text-secondary hover:bg-white/[0.04]"}`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <ConnectionBadge />
          <button className="w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-white/[0.06] transition-all border border-transparent hover:border-border">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto relative z-10">
        {children}
      </main>
    </div>
  );
}

function ConnectionBadge() {
  // Tie to Supabase realtime / worker status
  const connected = true;
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border
      ${connected
        ? "bg-success-bg border-success/30 text-success"
        : "bg-white/[0.03] border-border text-text-muted"}`}>
      <span className={`w-1.5 h-1.5 rounded-full
        ${connected ? "bg-success shadow-[0_0_6px_currentColor]" : "bg-text-muted"}`} />
      {connected ? "Worker online" : "Chưa kết nối"}
    </div>
  );
}
```

---

## 19.7 React Flow canvas styling

```css
/* apps/web/app/globals.css — append */

/* React Flow theme */
.react-flow {
  background: var(--bg-primary);
}

.react-flow__background {
  background-color: var(--bg-primary);
}

.react-flow__node {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  font-family: var(--font);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.react-flow__node.selected {
  border-color: var(--accent);
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.3),
    0 0 0 2px var(--accent-glow);
}

.react-flow__handle {
  background: var(--accent);
  border: 2px solid var(--bg-card);
  width: 10px;
  height: 10px;
}

.react-flow__edge-path {
  stroke: rgba(138, 92, 246, 0.5);
  stroke-width: 2;
}

.react-flow__edge.selected .react-flow__edge-path,
.react-flow__edge.animated .react-flow__edge-path {
  stroke: var(--accent);
}

.react-flow__minimap {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.react-flow__controls {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.react-flow__controls button {
  background: transparent;
  border: none;
  color: var(--text-secondary);
}

.react-flow__controls button:hover {
  background: var(--accent-glow);
  color: var(--accent);
}
```

---

## 19.8 Custom node component (BaseNode)

```typescript
// apps/web/components/nodes/BaseNode.tsx
import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BaseNodeProps {
  icon: ReactNode;
  title: string;
  selected?: boolean;
  status?: "idle" | "running" | "success" | "error";
  hasInput?: boolean;
  hasOutput?: boolean;
  children: ReactNode;
}

export function BaseNode({
  icon, title, selected, status = "idle",
  hasInput = true, hasOutput = true, children
}: BaseNodeProps) {
  const statusColors = {
    idle: "border-border",
    running: "border-info shadow-[0_0_20px_rgba(96,165,250,0.3)] animate-pulse",
    success: "border-success/50 shadow-[0_0_20px_rgba(52,211,153,0.2)]",
    error: "border-error/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
  };

  return (
    <div className={cn(
      "bg-bg-card rounded-2xl border-2 transition-all w-80",
      selected ? "border-accent shadow-accent-glow" : statusColors[status]
    )}>
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-accent !border-bg-card !w-2.5 !h-2.5"
        />
      )}

      <div className="px-4 py-3 border-b border-border flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-accent-glow flex items-center justify-center text-accent">
          {icon}
        </div>
        <h3 className="font-semibold text-sm text-text-primary">{title}</h3>
        {status === "running" && (
          <div className="ml-auto w-2 h-2 rounded-full bg-info animate-pulse" />
        )}
      </div>

      <div className="p-4 space-y-3">
        {children}
      </div>

      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-accent !border-bg-card !w-2.5 !h-2.5"
        />
      )}
    </div>
  );
}
```

---

## 19.9 Pages migration roadmap

| Page | Effort | Reference từ tool họ |
|---|---|---|
| Login (`/login`) | 2h | `public/login.html` (lines 1-1163) |
| App layout (top nav) | 2h | `public/index.html` (lines 68-122 — topnav) |
| Flows list | 3h | New design dựa trên glass cards grid |
| Canvas (`/canvas`) | 4h | React Flow + BaseNode + connection panel overlay |
| Account manager | 3h | `public/index.html` (lines 124-150 — connect panel) |
| Runs history | 2h | List với progress bar + status badges |
| Runs detail | 2h | Tree view sub-jobs + video preview |
| Settings modal | 1h | Overlay panel pattern |

**Total ~19h** cho complete UI rewrite. Có thể chia 2 sprint.

---

## 19.10 Migration order (recommended)

**Sprint 8A (1-2 ngày):**
1. Update `tailwind.config.ts` + `globals.css` với design tokens
2. Setup Inter font qua `next/font`
3. Tạo shared components: `BackgroundEffects`, `GlassCard`, `GradientLogo`, `GradientText`
4. Update `Button` variants với gradient + glow

**Sprint 8B (1-2 ngày):**
5. Rewrite `(auth)/login/page.tsx`
6. Rewrite `(app)/layout.tsx` với top nav
7. Style React Flow canvas (CSS)
8. Update `BaseNode.tsx` + 7 custom node components

**Sprint 8C (1-2 ngày):**
9. Flows list page
10. Account manager page
11. Runs history + detail pages
12. Settings modal

---

## 19.11 Material Symbols → lucide-react map

Tool họ dùng `Material Symbols Rounded`. Veo Farm dùng `lucide-react`. Map icons:

| Material | lucide-react | Usage |
|---|---|---|
| `edit_note` | `Pencil` | Prompt tab |
| `hub` | `Hub` | Builder/canvas |
| `storefront` | `Store` | Store tab |
| `home` | `Home` | Main page |
| `person` | `User` | User badge |
| `link` | `Link2` | Connection |
| `settings` | `Settings` | Settings |
| `logout` | `LogOut` | Logout |
| `login` | `LogIn` | Login |
| `person_add` | `UserPlus` | Register |
| `mail` | `Mail` | Email field |
| `lock` | `Lock` | Password |
| `visibility` / `visibility_off` | `Eye` / `EyeOff` | Show pwd |
| `rocket_launch` | `Rocket` | CTA button |
| `system_update_alt` | `Download` | Update |
| `workspace_premium` | `Crown` | Plan badge |
| `arrow_upward` | `ArrowUp` | Upgrade |
| `dashboard` | `LayoutDashboard` | Dashboard |
| `check_circle` | `CheckCircle2` | Success |
| `error` | `AlertCircle` | Error |
| `warning` | `AlertTriangle` | Warning |
| `info` | `Info` | Info |
| `close` | `X` | Close button |
| `add` | `Plus` | Add account |

---

## 19.12 Reality check

**KHÔNG copy:**
- License system + plan badges (Veo Farm dùng Supabase auth single-user)
- Pricing modal (không bán SaaS)
- Update overlay (Next.js không có auto-update Electron)
- Webhook config notice (Supabase auth tự handle)
- Force update overlay
- "Workflow Giá Rẻ" branding
- HWID checking
- "Trở về Trang chủ" button to external site

**COPY:**
- Color palette + design tokens
- BackgroundEffects (3 floating orbs)
- Glass cards với backdrop-blur
- Gradient buttons + logos
- Top nav layout với tabs
- Connection panel overlay pattern
- Status badges (success/error/warning/info)
- Card appear animations
- Inter font + tracking
- Material icons → lucide-react

→ **Output:** UI Veo Farm sẽ có **70-80% vibe** giống tool họ — đủ để cảm giác "pro tool".
