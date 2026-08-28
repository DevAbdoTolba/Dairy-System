import { createTheme } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    transaction: { production: string; sale: string; return: string; adjustment: string };
    weight: { five: string; eight: string; ten: string; fifteen: string };
  }
  interface PaletteOptions {
    transaction?: Partial<Palette["transaction"]>;
    weight?: Partial<Palette["weight"]>;
  }
}

export const theme = createTheme({
  direction: "rtl",
  palette: {
    mode: "light",
    primary: { main: "#075985", dark: "#0c4a6e", contrastText: "#ffffff" },
    secondary: { main: "#9a3412", contrastText: "#ffffff" },
    background: { default: "#f8fafc", paper: "#ffffff" },
    text: { primary: "#172033", secondary: "#3f4c61" },
    success: { main: "#166534" },
    warning: { main: "#92400e" },
    error: { main: "#b42318" },
    transaction: {
      production: "#0f766e",
      sale: "#b42318",
      return: "#6d28d9",
      adjustment: "#92400e",
    },
    weight: { five: "#075985", eight: "#7c2d12", ten: "#166534", fifteen: "#6d28d9" },
  },
  shape: { borderRadius: 12 },
  spacing: 8,
  typography: {
    fontFamily: "Tahoma, Arial, sans-serif",
    fontSize: 18,
    h1: { fontSize: "1.7rem", fontWeight: 800, lineHeight: 1.3 },
    h2: { fontSize: "1.35rem", fontWeight: 800, lineHeight: 1.35 },
    h3: { fontSize: "1.15rem", fontWeight: 800 },
    button: { fontSize: "1rem", fontWeight: 800 },
  },
  transitions: {
    create: () => "none",
    duration: {
      shortest: 0,
      shorter: 0,
      short: 0,
      standard: 0,
      complex: 0,
      enteringScreen: 0,
      leavingScreen: 0,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "*, *::before, *::after": { transition: "none !important", animation: "none !important" },
      },
    },
    MuiButton: {
      styleOverrides: { root: { minHeight: 48, borderRadius: 12, textTransform: "none" } },
    },
    MuiTextField: { defaultProps: { fullWidth: true, variant: "outlined" } },
    MuiInputBase: { styleOverrides: { input: { fontSize: "1.1rem" } } },
    MuiCard: {
      styleOverrides: {
        root: { boxShadow: "0 1px 3px rgba(15, 23, 42, .15)", border: "1px solid #d7dee9" },
      },
    },
  },
});
