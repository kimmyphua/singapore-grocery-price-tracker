import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18202a",
        mist: "#f5f7f8",
        berry: "#f65db7",
        mint: "#5bf0d4",
        olive: "#9fab6b",
        meadow: "#bbd7a6",
        teal: "#53a5b7",
        leaf: "#53a5b7",
        citrus: "#9fab6b"
      }
    }
  },
  plugins: []
};

export default config;
