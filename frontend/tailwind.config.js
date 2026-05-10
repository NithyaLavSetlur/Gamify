/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f6f2ea",
        panel: "#ffffff",
        panel2: "#f6f1e8",
        gold: "#d9c9ff",
        ember: "#c8b1ff",
        jade: "#8b7cf6",
        rune: "#6957e6",
        midnight: "#fcfaf6",
        steel: "#d9d3c8",
        arcane: "#efe8ff"
      },
      boxShadow: {
        glow: "0 18px 50px rgba(109, 87, 230, 0.12)",
        goldglow: "0 0 34px rgba(188, 165, 255, 0.16)",
        emberglow: "0 0 28px rgba(168, 141, 255, 0.14)"
      }
    }
  },
  plugins: []
};
