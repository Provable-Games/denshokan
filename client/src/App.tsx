import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import GameBrowserPage from "./pages/GameBrowserPage";
import GameDetailPage from "./pages/GameDetailPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import MintTokenPage from "./pages/MintTokenPage";
import TokenDetailPage from "./pages/TokenDetailPage";
import PortfolioPage from "./pages/PortfolioPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/games" element={<GameBrowserPage />} />
        <Route path="/games/:gameId" element={<GameDetailPage />} />
        <Route path="/games/:gameId/leaderboard" element={<LeaderboardPage />} />
        <Route path="/mint" element={<MintTokenPage />} />
        <Route path="/tokens/:tokenId" element={<TokenDetailPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
      </Route>
    </Routes>
  );
}
