import { ReactNode } from "react";
import { DenshokanProvider } from "@provable-games/denshokan-sdk/react";
import { useChainConfig } from "./NetworkContext";

export function DenshokanProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const { chainConfig, chainId } = useChainConfig();

  const denshokanConfig = {
    chain: chainConfig.networkName,
    apiUrl: chainConfig.apiUrl,
    rpcUrl: chainConfig.rpcUrl,
    denshokanAddress: chainConfig.denshokanAddress,
    registryAddress: chainConfig.registryAddress,
    viewerAddress: chainConfig.viewerAddress,
    primarySource: "api" as const,
  };

  return (
    <DenshokanProvider key={chainId} config={denshokanConfig}>
      {children}
    </DenshokanProvider>
  );
}
