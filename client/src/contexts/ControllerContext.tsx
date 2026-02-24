import { createContext, useContext, ReactNode, useMemo, useCallback } from "react";
import { useAccount, useConnect, useDisconnect, type Connector } from "@starknet-react/core";

interface ControllerContextValue {
  isConnected: boolean;
  isPending: boolean;
  address: string | undefined;
  username: string | null;
  connectors: readonly Connector[];
  login: (connector?: Connector) => void;
  logout: () => void;
}

const ControllerContext = createContext<ControllerContextValue | null>(null);

export function ControllerProvider({ children }: { children: ReactNode }) {
  const { address, status } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const isConnected = status === "connected";
  const isPending = status === "reconnecting" || status === "connecting";

  const login = useCallback((connector?: Connector) => {
    const target = connector ?? connectors[0];
    if (target) {
      connect({ connector: target });
    }
  }, [connect, connectors]);

  const logout = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const value = useMemo(
    () => ({
      isConnected,
      isPending,
      address: address ? `0x${address.slice(2).toLowerCase()}` : undefined,
      username: null, // Controller username resolved elsewhere if needed
      connectors,
      login,
      logout,
    }),
    [isConnected, isPending, address, connectors, login, logout]
  );

  return (
    <ControllerContext.Provider value={value}>
      {children}
    </ControllerContext.Provider>
  );
}

export function useController() {
  const ctx = useContext(ControllerContext);
  if (!ctx) throw new Error("useController must be used within ControllerProvider");
  return ctx;
}
