/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18131f",
        panel: "#211a2b",
        panel2: "#2a2236",
        gold: "#f0d48a",
        ember: "#ef8f75",
        jade: "#c4b5fd",
        rune: "#a78bfa",
        midnight: "#110d17",
        steel: "#40364f",
        arcane: "#ddd6fe"
      },
      boxShadow: {
        glow: "0 18px 50px rgba(124, 91, 172, 0.18)",
        goldglow: "0 0 34px rgba(240, 212, 138, 0.2)",
        emberglow: "0 0 28px rgba(239, 143, 117, 0.2)"
      }
    }
  },
  plugins: []
};
