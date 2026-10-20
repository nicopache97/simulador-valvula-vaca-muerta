/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta base gris ISA-101 (REQ-UI-01)
        neutral: {
          50: '#f7f7f8', 100: '#efeef0', 200: '#dad9de', 300: '#bab8c1',
          400: '#95929e', 500: '#787582', 600: '#615e6b', 700: '#504d57',
          800: '#44424a', 900: '#3c3a40', 950: '#1c1c1f',
        },
        // Codificación de alarmas ISA-18.2 (REQ-UI-04)
        alarm: {
          critical: '#ed113b',
          high: '#e7ac0b',
          low: '#006bcb',
        },
      },
    },
  },
  plugins: [],
}
