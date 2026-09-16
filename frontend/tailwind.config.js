/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F2EA",
        ink: "#1E2A22",
        // Airmail-envelope cobalt — the one accent in the whole app, reserved
        // exclusively for marking "the assistant did this." Manual UI stays
        // monochrome so an AI-driven change is always visually legible.
        signal: "#2B4A8C",
        line: "#DFDACB",
        muted: "#7C7A6C",
        unread: "#8C5A2B",
      },
      fontFamily: {
        serif: ["'Source Serif 4'", "Georgia", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
