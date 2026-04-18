/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'warm-stone': {
          DEFAULT: '#f5f2ef',
          hover: '#e8e4e0',
          translucent: 'rgba(245, 242, 239, 0.8)',
        },
        'system-gray': {
          100: '#f5f5f5',
          200: '#f6f6f6',
          300: '#e5e5e5',
          400: '#777169',
          500: '#4e4e4e',
        }
      },
      boxShadow: {
        'xs-inset': 'rgba(0,0,0,0.075) 0px 0px 0px 0.5px inset',
        'xs-outline': 'rgba(0,0,0,0.06) 0px 0px 0px 1px',
        'subtle-elevate': 'rgba(0,0,0,0.04) 0px 4px 4px',
        'card': 'rgba(0,0,0,0.4) 0px 0px 1px, rgba(0,0,0,0.04) 0px 4px 4px',
        'warm': 'rgba(78,50,23,0.04) 0px 6px 16px',
        'glass-edge': 'rgba(0,0,0,0.06) 0px 0px 0px 1px, rgba(0,0,0,0.075) 0px 0px 0px 0.5px inset'
      },
      fontFamily: {
        'sans': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        'display': ['Waldenburg', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
