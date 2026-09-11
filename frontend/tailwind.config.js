/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      colors: {
        // Warm concrete/paper base — the working surface.
        paper: {
          DEFAULT: "#F6F4EF",
          panel: "#FFFFFF",
          border: "#E3E0D6",
        },
        // Fixed steel console panel (sidebar), same in light & dark.
        steel: {
          950: "#12161A",
          900: "#181D22",
          800: "#20262C",
          700: "#2B333A",
          600: "#3B454D",
          400: "#8A949C",
          200: "#C8CFD4",
          100: "#EDEFF1",
        },
        // Hazard amber — the one accent spent boldly.
        amber: {
          50: "#FBF2DE",
          200: "#F0CE83",
          400: "#EAB233",
          500: "#DC9A1C",
          600: "#B87E14",
          700: "#8F6110",
        },
        // Steel-teal secondary accent.
        teal: {
          50: "#E9F3F2",
          200: "#9FC7C4",
          500: "#2B6E71",
          600: "#215659",
        },
        ink: {
          DEFAULT: "#1C1B18",
          muted: "#6B6A63",
          faint: "#9C9A91",
        },
        ok: { 50: "#E7F4EC", 500: "#2F8557", 600: "#256B45" },
        danger: { 50: "#FBEAE7", 500: "#B4402F", 600: "#963527" },
      },
      boxShadow: {
        panel: "0 1px 2px rgba(28,27,24,0.04), 0 1px 0 rgba(28,27,24,0.03)",
        pop: "0 12px 32px rgba(18,22,26,0.18)",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
      },
      keyframes: {
        stagger: {
          "0%": { opacity: 0, transform: "translateY(6px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.35 },
        },
      },
      animation: {
        stagger: "stagger 0.35s ease-out both",
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
