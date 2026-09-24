import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./template/**/*.{ts,tsx}"],
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
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "scale-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.96)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-out-right": {
          from: { opacity: "1", transform: "translateX(0)" },
          to: { opacity: "0", transform: "translateX(16px)" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "toast-out": {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(4px)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out both",
        "fade-in-fast": "fade-in-fast 0.15s ease-out both",
        "fade-out": "fade-out 0.15s ease-in both",
        "scale-in": "scale-in 0.18s ease-out both",
        "scale-out": "scale-out 0.12s ease-in both",
        "slide-in-right": "slide-in-right 0.2s ease-out both",
        "slide-out-right": "slide-out-right 0.15s ease-in both",
        "toast-in": "toast-in 0.2s ease-out both",
        "toast-out": "toast-out 0.15s ease-in both",
      },
    },
  },
  plugins: [],
};

export default config;
