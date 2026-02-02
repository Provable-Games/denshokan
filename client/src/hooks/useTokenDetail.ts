import { useEffect } from "react";
import { useTokenStore } from "../stores/tokenStore";
import { api } from "../services/api";
import { useState } from "react";

export function useTokenDetail(tokenId: string) {
  const { tokenDetails, fetchTokenDetail } = useTokenStore();
  const [scores, setScores] = useState<any[]>([]);

  useEffect(() => {
    if (tokenId) {
      fetchTokenDetail(tokenId);
      api.getTokenScores(tokenId, 100).then((res) => setScores(res.data)).catch(() => {});
    }
  }, [tokenId]);

  return {
    token: tokenDetails[tokenId] || null,
    scores,
  };
}
