import React, { createContext, useContext, useState, useEffect } from "react";

export type Theme = "emerald" | "forest";

interface ThemeContextProps {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode; initialTheme?: Theme }> = ({ 
  children, 
  initialTheme = "emerald" 
}) => {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    // Sync theme to root html tag for DaisyUI v5
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "forest") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "emerald" ? "forest" : "emerald"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
