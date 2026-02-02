import { createContext, useContext, ReactNode, useMemo, useCallback } from "react";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";

interface ControllerContextValue {
  isConnected: boolean;
  isPending: boolean;
  address: string | undefined;
  username: string | null;
  login: () => void;
  logout: () => void;
}

const ControllerContext = createContext<ControllerContextValue | null>(null);

export function ControllerProvider({ children }: { children: ReactNode }) {
  const { address, status } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const isConnected = status === "connected";
  const isPending = status === "reconnecting" || status === "connecting";

  const login = useCallback(() => {
    const controller = connectors[0];
    if (controller) {
      connect({ connector: controller });
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
      login,
      logout,
    }),
    [isConnected, isPending, address, login, logout]
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
