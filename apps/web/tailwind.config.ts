import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'var(--font-arabic)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          soft: 'hsl(var(--primary-soft))',
        },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        subtle: 'hsl(var(--subtle))',
        ink: {
          DEFAULT: 'hsl(var(--ink))',
          foreground: 'hsl(var(--ink-foreground))',
          muted: 'hsl(var(--ink-muted))',
          line: 'hsl(var(--ink-line))',
        },
        highlight: 'hsl(var(--highlight))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        success: { DEFAULT: 'hsl(var(--success))', soft: 'hsl(var(--success-soft))' },
        warning: { DEFAULT: 'hsl(var(--warning))', soft: 'hsl(var(--warning-soft))' },
        danger: { DEFAULT: 'hsl(var(--danger))', soft: 'hsl(var(--danger-soft))' },
        info: { DEFAULT: 'hsl(var(--info))', soft: 'hsl(var(--info-soft))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 3px)',
        sm: 'calc(var(--radius) - 5px)',
      },
      boxShadow: {
        card: '0 1px 0 0 rgb(11 42 51 / 0.04)',
        raised: '0 1px 2px 0 rgb(11 42 51 / 0.05), 0 8px 24px -12px rgb(11 42 51 / 0.18)',
        popover: '0 16px 40px -12px rgb(11 42 51 / 0.28), 0 4px 12px -6px rgb(11 42 51 / 0.12)',
        glass: '0 1px 0 0 rgb(255 255 255 / 0.5) inset, 0 30px 60px -20px rgb(3 20 26 / 0.55)',
      },
      spacing: {
        /* The minimum comfortable touch target, referenced by every control. */
        touch: '2.75rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(2px)' }, to: { opacity: '1', transform: 'none' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
        pulse_dot: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'rise-in': 'rise-in 520ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'slide-in': 'slide-in 200ms cubic-bezier(0.2, 0.7, 0.2, 1)',
        'pulse-dot': 'pulse_dot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
