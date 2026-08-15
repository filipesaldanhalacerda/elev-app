import { BrowserRouter, Routes, Route } from "react-router-dom";
import Showcase from "./pages/Showcase";

/**
 * Rotas do app. As telas do produto entram nas etapas E4+ copiando os quadros
 * do handoff — nada de UI inventada. /showcase é a vitrine interna da E2.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/showcase" element={<Showcase />} />
        <Route path="*" element={<div data-app-shell style={{ minHeight: "100dvh", background: "var(--bg)" }} />} />
      </Routes>
    </BrowserRouter>
  );
}
