import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        peach: "#ff9890",
        ivory: "#fff9f3",
        sage: "#bfd8b8",
        lilac: "#c9b7f6",
        charcoal: "#444444",
        ink: "#444444",
        mist: "#fff9f3",
        berry: "#ff9890",
        mint: "#bfd8b8",
        olive: "#bfd8b8",
        meadow: "#bfd8b8",
        teal: "#ff9890",
        leaf: "#bfd8b8",
        citrus: "#c9b7f6"
      }
    }
  },
  plugins: []
};

export default config;
