import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installStaleChunkRecovery } from "./services/staleChunkRecovery";
import "./index.css";

installStaleChunkRecovery();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
