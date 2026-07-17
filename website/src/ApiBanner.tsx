import React from 'react';
import { useAppTheme } from './ThemeContext';

const ApiBanner: React.FC = () => {
  const { currentTheme } = useAppTheme();

  return (
    <div
      style={{
        backgroundColor: '#ff9800',
        color: '#000',
        padding: '12px 16px',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: 500,
        borderBottom: '1px solid #f57c00',
      }}
    >
      ⚠️ Due to changes in GitHub's API, the stars count cannot be retrieved at this time.
    </div>
  );
};

export default ApiBanner;
