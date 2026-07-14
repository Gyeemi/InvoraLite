import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";

export type Theme = "light" | "dark";

const THEME_LOCAL_KEY = "invora_theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
  try {
    localStorage.setItem(THEME_LOCAL_KEY, theme);
  } catch {
    // Ignore private browsing / storage errors.
  }
}

function readInitialTheme(): Theme {
  if (typeof document !== "undefined") {
    return document.documentElement.classList.contains("light") ? "light" : "dark";
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    void storageGet(STORAGE_KEYS.theme).then((saved) => {
      if (saved === "light" || saved === "dark") {
        setThemeState(saved);
        applyTheme(saved);
      }
    });
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    void storageSet(STORAGE_KEYS.theme, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      void storageSet(STORAGE_KEYS.theme, next);
      return next;
    });
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
