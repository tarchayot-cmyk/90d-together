import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        me: "#7CB342", // seedling green
        we: "#43A047", // sapling green
        us: "#2E7D32", // tree green
        kindness: "#FF8A65",
        sticker: {
          yellow: "#FDD835",
          pink: "#F06292",
          red: "#E53935",
          purple: "#8E24AA",
          orange: "#FB8C00",
          rainbow: "#26C6DA",
        },
        bg: "#F7FBF5",
      },
      borderRadius: {
        card: "18px",
      },
    },
  },
  plugins: [],
};

export default config;
