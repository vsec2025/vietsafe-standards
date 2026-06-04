/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vs: {
          red: '#C8102E',
          'red-dark': '#A00D24',
          dark: '#1A1A1A',
          gray: '#333333',
          'gray-light': '#F0F0F0',
          'gray-mid': '#666666',
          'gray-border': '#999999',
        }
      },
      fontFamily: {
        montserrat: ['Montserrat', 'Arial', 'sans-serif'],
      }
    }
  },
  plugins: []
}
