import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import GameBrowserPage from "./pages/GameBrowserPage";
import GameDetailPage from "./pages/GameDetailPage";
import MintTokenPage from "./pages/MintTokenPage";
import TokenDetailPage from "./pages/TokenDetailPage";
import PortfolioPage from "./pages/PortfolioPage";
import NumberGuessPlayPage from "./pages/NumberGuessPlayPage";
import MintersPage from "./pages/MintersPage";
import SettingsPage from "./pages/SettingsPage";
import ObjectivesPage from "./pages/ObjectivesPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/games" element={<GameBrowserPage />} />
        <Route path="/games/:gameId" element={<GameDetailPage />} />
        <Route path="/mint" element={<MintTokenPage />} />
        <Route path="/tokens/:tokenId" element={<TokenDetailPage />} />
        <Route path="/tokens/:tokenId/play" element={<NumberGuessPlayPage />} />
        <Route path="/minters" element={<MintersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/objectives" element={<ObjectivesPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
      </Route>
    </Routes>
  );
}
