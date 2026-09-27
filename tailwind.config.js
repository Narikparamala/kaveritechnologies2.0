/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // Institutional Indigo — Lumina Academic System (brand primary #004B8D).
        // The scale keeps the existing `primary-*` token names so every screen
        // re-skins without touching component files.
        primary: {
          50: '#EAF4FF',  // spec: active sidebar tint
          100: '#D4E3FF', // primary-fixed
          200: '#A6C8FF', // primary-fixed-dim / inverse-primary
          300: '#6FA8E8',
          400: '#3D82C9',
          500: '#0062B1',
          600: '#004B8D', // brand primary
          700: '#003D75',
          800: '#003465', // deepest logo indigo
          900: '#002A52',
        },
        // Achievement-adjacent info blue — brand tertiary (#00AEEF, water motif).
        // Keeps the legacy `teal-*` token names used across the app.
        teal: {
          50: '#E5F7FF',
          100: '#C2ECFF',
          200: '#82CFFF', // tertiary-fixed-dim
          300: '#4FB9F5',
          400: '#22A6EF',
          500: '#00AEEF', // brand tertiary
          600: '#0090C7',
          700: '#00719E',
          800: '#005070', // tertiary-container
          900: '#003850',
        },
        // Achievement Gold — #FFD700. Reserved for value actions: enroll,
        // buy, certificates, milestones, completed-section checkmarks.
        gold: {
          50: '#FFFBEB',
          100: '#FFF3B8',
          200: '#FFE98A',
          300: '#FFDF4D',
          400: '#FFD700', // brand gold
          500: '#F2C700',
          600: '#D9AE00',
          700: '#B08D00',
          800: '#8A6E00',
          900: '#544600', // on-secondary-fixed-variant
        },
        navy: {
          800: '#1E293B',
          900: '#0F172A',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'pulse-slow': 'pulse 3s infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        // Lumina elevation: soft ambient occlusion tinted with the brand
        // indigo instead of heavy neutral shadows.
        'glow-blue': '0 0 20px rgba(0, 75, 141, 0.25)',
        'glow-teal': '0 0 20px rgba(0, 174, 239, 0.25)',
        'glow-gold': '0 0 20px rgba(255, 215, 0, 0.28)',
        'card': '0 1px 2px rgba(0, 75, 141, 0.05), 0 8px 24px rgba(0, 75, 141, 0.08)',
        'card-hover': '0 2px 4px rgba(0, 75, 141, 0.06), 0 12px 32px rgba(0, 75, 141, 0.12)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
