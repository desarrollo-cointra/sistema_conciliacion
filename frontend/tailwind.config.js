/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3B82F6",
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        neutral: "#64748B",
        bg: "#F8FAFC",
        sidebar: "#1E293B",
        border: "#E2E8F0",
        text: "#1E293B",
      },
    },
  },
  plugins: [],
};

