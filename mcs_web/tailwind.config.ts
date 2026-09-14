import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef5ff",
          100: "#d9e8ff",
          200: "#bcd7ff",
          300: "#8ebdff",
          400: "#5998ff",
          500: "#2f72f7",
          600: "#1b54e0",
          700: "#1642b8",
          800: "#173a91",
          900: "#183573",
          950: "#122148",
        },
      },
      fontFamily: {
        // System font stack — tanpa fetch Google Fonts saat build (dipakai "Inter"
        // bila tersedia di OS, selebihnya jatuh ke font sistem). Ringan, offline-safe.
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
        ],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-fast": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out both",
        "fade-in-fast": "fade-in-fast 0.15s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
