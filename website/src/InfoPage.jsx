import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import info from "./info.md";
import { motion } from "framer-motion";


const InfoPage = () => {
  const [markdownContent, setMarkdownContent] = useState("");

  useEffect(() => {
    fetch(info) // Fetch the markdown file
      .then((response) => response.text())
      .then((text) => setMarkdownContent(text))
      .catch((error) => console.error(error));
  }, []);

  const customRenderer = {
    a: ({ href, children }) => (
      <Link
        to={href}
        style={{ color: "#0366d6", textDecoration: "underlined" }}
      >
        {children}
      </Link>
    ),
  };

return (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.3 }}
    style={{ margin: "20px 20px" }}
  >
    <ReactMarkdown components={customRenderer}>
      {markdownContent}
    </ReactMarkdown>
  </motion.div>
);
};

export default InfoPage;
