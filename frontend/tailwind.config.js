/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        risk: {
          low: '#10B981',       // Green
          moderate: '#F59E0B',  // Amber/Yellow
          high: '#F97316',      // Orange
          severe: '#EF4444',    // Red
          notravel: '#7F1D1D',  // Deep Dark Red/Burgundy
        }
      }
    },
  },
  plugins: [],
}
