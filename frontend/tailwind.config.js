/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe7fe",
          500: "#3b5fe0",
          600: "#2e4bc7",
          700: "#243aa0",
        },
      },
    },
  },
  plugins: [],
};
