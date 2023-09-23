import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
const root = ReactDOM.createRoot(document.getElementById("root"));
import { HashRouter } from "react-router-dom";
root.render(
  <React.StrictMode>
    <div>
      <HashRouter>
        <App />
      </HashRouter>
    </div>
  </React.StrictMode>
);
