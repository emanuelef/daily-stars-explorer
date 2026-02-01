import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import { Box, Paper, Typography } from "@mui/material";
import info from "./info.md";
import { useAppTheme } from "./ThemeContext";

const InfoPage = () => {
  const { theme, currentTheme } = useAppTheme();
  const isDark = theme === 'dark';
  const [markdownContent, setMarkdownContent] = useState("");

  useEffect(() => {
    fetch(info)
      .then((response) => response.text())
      .then((text) => setMarkdownContent(text))
      .catch((error) => console.error(error));
  }, []);

  const customRenderer = {
    a: ({ href, children }) => {
      const isExternal = href.startsWith("http");
      if (isExternal) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#1976d2", textDecoration: "none", fontWeight: 500 }}
          >
            {children}
          </a>
        );
      }
      return (
        <Link to={href} style={{ color: "#1976d2", textDecoration: "none", fontWeight: 500 }}>
          {children}
        </Link>
      );
    },
    h1: ({ children }) => (
      <Typography variant="h4" sx={{ mb: 3, mt: 2, fontWeight: 600, color: currentTheme.textPrimary }}>
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography variant="h5" sx={{ mb: 2, mt: 4, fontWeight: 600, color: "#1976d2" }}>
        {children}
      </Typography>
    ),
    p: ({ children }) => (
      <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7, color: currentTheme.textSecondary }}>
        {children}
      </Typography>
    ),
    ul: ({ children }) => (
      <Box component="ul" sx={{ pl: 3, mb: 2 }}>
        {children}
      </Box>
    ),
    li: ({ children }) => (
      <Typography component="li" variant="body1" sx={{ mb: 1.5, lineHeight: 1.7, color: currentTheme.textSecondary }}>
        {children}
      </Typography>
    ),
    strong: ({ children }) => (
      <Typography component="span" sx={{ fontWeight: 600, color: isDark ? "#90caf9" : "#1976d2" }}>
        {children}
      </Typography>
    ),
  };

  return (
    <Box sx={{ p: 3, width: { xs: "100%", sm: "95%", md: "90%" }, maxWidth: 1200, mx: "auto", background: currentTheme.background, minHeight: '100vh' }}>
      <Paper elevation={2} sx={{ p: 4, background: currentTheme.cardGradient, border: `1px solid ${currentTheme.cardBorder}` }}>
        <ReactMarkdown components={customRenderer}>
          {markdownContent}
        </ReactMarkdown>
      </Paper>
    </Box>
  );
};

export default InfoPage;
