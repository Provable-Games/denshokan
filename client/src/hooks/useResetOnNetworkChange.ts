import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useChainConfig } from "../contexts/NetworkContext";

export function useResetOnNetworkChange() {
  const { chainId } = useChainConfig();
  const navigate = useNavigate();
  const prevChainId = useRef(chainId);

  useEffect(() => {
    if (prevChainId.current !== chainId) {
      prevChainId.current = chainId;
      navigate("/", { replace: true });
    }
  }, [chainId, navigate]);
}
