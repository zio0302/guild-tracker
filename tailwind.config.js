/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Pretendard', 'system-ui', 'sans-serif'],
      },
      colors: {
        // 메이플 테마 색상 팔레트
        maple: {
          50: '#fef2f2',
          100: '#ffe4e4',
          200: '#ffcece',
          300: '#fba4a4',
          400: '#f67070',
          500: '#ed4444',
          600: '#d92626',
          700: '#b71c1c',
          800: '#971a1a',
          900: '#7c1c1c',
        },
      },
    },
  },
  plugins: [],
};
