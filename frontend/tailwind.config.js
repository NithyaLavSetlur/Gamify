/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1020",
        panel: "#111827",
        panel2: "#172033",
        gold: "#f4c95d",
        ember: "#ff7a45",
        jade: "#2dd4bf",
        rune: "#8b5cf6",
        midnight: "#070a13",
        steel: "#253047",
        arcane: "#c084fc"
      },
      boxShadow: {
        glow: "0 0 40px rgba(45, 212, 191, 0.18)",
        goldglow: "0 0 34px rgba(244, 201, 93, 0.22)",
        emberglow: "0 0 28px rgba(255, 122, 69, 0.24)"
      }
    }
  },
  plugins: []
};
