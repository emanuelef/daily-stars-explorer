import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const THEMES = {
  dark: {
    name: 'dark',
    background: '#0f0f0f',
    cardGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    cardBorder: 'rgba(59, 130, 246, 0.2)',
    sidebarBg: '#1a1a2e',
    textPrimary: '#ffffff',
    textSecondary: '#e5e7eb',
    textMuted: '#9ca3af',
    accentBg: 'rgba(59, 130, 246, 0.2)',
    accentHover: 'rgba(59, 130, 246, 0.1)',
  },
  light: {
    name: 'light',
    background: '#f5f5f5',
    cardGradient: 'linear-gradient(135deg, #ffffff 0%, #f0f4f8 100%)',
    cardBorder: 'rgba(59, 130, 246, 0.3)',
    sidebarBg: '#ffffff',
    textPrimary: '#1a1a2e',
    textSecondary: '#374151',
    textMuted: '#6b7280',
    accentBg: 'rgba(59, 130, 246, 0.15)',
    accentHover: 'rgba(59, 130, 246, 0.1)',
  },
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('app-theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const currentTheme = THEMES[theme];

  return (
    <ThemeContext.Provider value={{ theme, currentTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return context;
}
