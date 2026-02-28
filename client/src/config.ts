import { getDefaultChainId, getNetworkConfig } from "./networks";

const defaultChainId = getDefaultChainId();
const defaultConfig = getNetworkConfig(defaultChainId);

export const config = defaultConfig;
export const networkName = defaultConfig.networkName;
