/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', '"Noto Sans Hebrew"', "system-ui", "sans-serif"],
      },
      colors: {
        // AppMyTrip design tokens (from the Google Stitch design system).
        primary: {
          DEFAULT: "#1a5276",
          dark: "#003b5a",
          light: "#94c5ee",
        },
        secondary: {
          DEFAULT: "#fe7e4f",
          dark: "#a43c12",
        },
        surface: {
          DEFAULT: "#fbf9f8",
          dim: "#dbd9d9",
          container: "#efeded",
          "container-low": "#f5f3f3",
          "container-high": "#eae8e7",
        },
        ink: {
          DEFAULT: "#1b1c1c",
          muted: "#41474e",
        },
        outline: {
          DEFAULT: "#c1c7cf",
        },
      },
      boxShadow: {
        card: "0 4px 20px rgba(0,0,0,0.06)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
      },
    },
  },
  plugins: [],
};
