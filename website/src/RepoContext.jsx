import { createContext, useContext, useState } from 'react';

const RepoContext = createContext();

const DEFAULT_REPO = "helm/helm";

export function RepoProvider({ children }) {
  const [lastRepo, setLastRepo] = useState(DEFAULT_REPO);

  return (
    <RepoContext.Provider value={{ lastRepo, setLastRepo }}>
      {children}
    </RepoContext.Provider>
  );
}

export function useLastRepo() {
  const context = useContext(RepoContext);
  if (!context) {
    throw new Error('useLastRepo must be used within a RepoProvider');
  }
  return context;
}
