import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#f5f3ee",
        foreground: "#14120f",
        card: "#fbfaf7",
        border: "#d8d0c2",
        muted: "#6f665b",
        accent: "#1f6b5d",
        danger: "#9f3a2f",
      },
    },
  },
  plugins: [],
};

export default config;
