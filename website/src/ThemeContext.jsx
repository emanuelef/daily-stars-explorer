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
    background: '#eef2f6', // softer cool gray for better contrast
    cardGradient: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', // cleaner card look
    cardBorder: 'rgba(148, 163, 184, 0.4)', // more visible, subtle border
    sidebarBg: '#ffffff',
    textPrimary: '#1e293b', // slate-900, less harsh than pure black
    textSecondary: '#475569', // slate-600
    textMuted: '#94a3b8', // slate-400
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
