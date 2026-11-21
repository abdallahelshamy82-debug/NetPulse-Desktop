import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-ibm-plex-arabic)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        canvas: {
          DEFAULT: "var(--bg-canvas)",
          elevated: "var(--bg-elevated)",
          subtle: "var(--bg-subtle)",
        },
        stroke: {
          DEFAULT: "var(--border-default)",
          strong: "var(--border-strong)",
        },
        ink: {
          DEFAULT: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        pulse: {
          cyan: "#06B6D4",
          emerald: "#10B981",
          amber: "#F59E0B",
          rose: "#F43F5E",
          blue: "#3B82F6",
        },
      },
      boxShadow: {
        panel: "0 1px 2px rgba(0, 0, 0, 0.08), 0 8px 24px -12px rgba(0, 0, 0, 0.25)",
        glowCyan: "0 0 24px -6px rgba(6, 182, 212, 0.35)",
        glowEmerald: "0 0 24px -6px rgba(16, 185, 129, 0.35)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "scan-line": "scanLine 2.4s ease-in-out infinite",
      },
      keyframes: {
        scanLine: {
          "0%, 100%": { transform: "translateX(-100%)" },
          "50%": { transform: "translateX(200%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
