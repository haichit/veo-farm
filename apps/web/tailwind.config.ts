import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        // shadcn legacy (kept for back-compat with existing components)
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        // Glass-morphism design tokens (SPEC §19.1)
        bg: {
          primary: '#0a0a12',
          secondary: '#111120',
          card: '#161628',
          'card-hover': '#1c1c38',
          input: '#12121f',
        },
        glass: {
          DEFAULT: 'rgba(20, 20, 40, 0.85)',
          border: 'rgba(138, 92, 246, 0.15)',
        },
        accent: {
          DEFAULT: '#8a5cf6',
          foreground: 'hsl(var(--accent-foreground))',
          hover: '#7c4dff',
          glow: 'rgba(138, 92, 246, 0.25)',
        },
        secondary: {
          DEFAULT: '#ec4899',
        },
        success: {
          DEFAULT: '#34d399',
          bg: 'rgba(52, 211, 153, 0.10)',
        },
        warning: {
          DEFAULT: '#fbbf24',
          bg: 'rgba(251, 191, 36, 0.10)',
        },
        error: {
          DEFAULT: '#ef4444',
          bg: 'rgba(239, 68, 68, 0.10)',
        },
        info: '#60a5fa',
        text: {
          primary: '#f0f0f5',
          secondary: '#a0a0b8',
          muted: '#5a5a75',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.06)',
          focus: 'rgba(138, 92, 246, 0.5)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '16px',
        sm: '10px',
        xs: '6px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
      },
      boxShadow: {
        glass:
          '0 0 0 1px rgba(255,255,255,0.03), 0 20px 80px rgba(0,0,0,0.5), 0 0 40px rgba(138,92,246,0.08)',
        'accent-glow': '0 8px 32px rgba(138, 92, 246, 0.3)',
        'accent-glow-lg': '0 8px 48px rgba(138, 92, 246, 0.5)',
        'success-glow': '0 4px 20px rgba(52, 211, 153, 0.3)',
        'error-glow': '0 4px 20px rgba(239, 68, 68, 0.3)',
      },
      animation: {
        'orb-float': 'orbFloat 25s ease-in-out infinite',
        'card-appear': 'cardAppear 0.6s ease-out',
        'logo-pulse': 'logoPulse 3s ease-in-out infinite',
        'spin-slow': 'spin 1.5s linear infinite',
      },
      keyframes: {
        orbFloat: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(40px, -30px) scale(1.1)' },
          '66%': { transform: 'translate(-30px, 20px) scale(0.95)' },
        },
        cardAppear: {
          from: { opacity: '0', transform: 'translateY(20px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        logoPulse: {
          '0%, 100%': { boxShadow: '0 8px 32px rgba(138, 92, 246, 0.3)' },
          '50%': { boxShadow: '0 8px 48px rgba(138, 92, 246, 0.5)' },
        },
      },
      backdropBlur: {
        glass: '40px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
