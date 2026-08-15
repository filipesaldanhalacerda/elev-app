import React from "react";
import ReactDOM from "react-dom/client";

// Fontes self-hosted (offline): IBM Plex Sans 400/500/600/700 · IBM Plex Mono 400/500/600
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
// Ícones Phosphor regular (única biblioteca permitida)
import "@phosphor-icons/web/regular/style.css";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";

import { initTheme } from "./lib/theme";
import App from "./App";

initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
