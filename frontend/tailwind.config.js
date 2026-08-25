/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0F17",
        card: "#131A24",
        sidebar: "#0F141D",
        border: "#1E2633",
        hover: "#1B2432",
        primary: "#7C5CFF",
        income: "#22C55E",
        expense: "#EF4444",
        warn: "#F59E0B",
        info: "#3B82F6",
        muted: "#8B95A7",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
      },
    },
  },
  plugins: [],
};
