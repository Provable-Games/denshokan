import { useState } from "react";
import { Box, Skeleton } from "@mui/material";
import BrokenImageIcon from "@mui/icons-material/BrokenImage";

interface Props {
  tokenUri?: string | null;
  alt?: string;
  height?: number | string;
  objectFit?: "contain" | "cover";
  sx?: Record<string, unknown>;
}

/**
 * Parses an on-chain token URI and extracts the image source.
 * Handles:
 * - data:application/json;base64,... → parse JSON, extract `image` field
 * - data:image/svg+xml;base64,...    → use directly as img src
 * - https://... or ipfs://...        → use directly as img src
 */
function resolveImageSrc(tokenUri: string): string | null {
  if (!tokenUri) return null;

  // Base64-encoded JSON metadata (ERC721 standard on-chain pattern)
  if (tokenUri.startsWith("data:application/json;base64,")) {
    try {
      const base64 = tokenUri.slice("data:application/json;base64,".length);
      const json = JSON.parse(atob(base64));
      return json.image || json.image_data || null;
    } catch {
      return null;
    }
  }

  // Plain JSON data URI
  if (tokenUri.startsWith("data:application/json,")) {
    try {
      const encoded = tokenUri.slice("data:application/json,".length);
      const json = JSON.parse(decodeURIComponent(encoded));
      return json.image || json.image_data || null;
    } catch {
      return null;
    }
  }

  // SVG or other image data URIs — render directly
  if (tokenUri.startsWith("data:image/")) {
    return tokenUri;
  }

  // HTTPS or IPFS URLs
  if (tokenUri.startsWith("http://") || tokenUri.startsWith("https://")) {
    return tokenUri;
  }

  if (tokenUri.startsWith("ipfs://")) {
    return tokenUri.replace("ipfs://", "https://ipfs.io/ipfs/");
  }

  return null;
}

export default function TokenImage({ tokenUri, alt = "Token", height = 200, objectFit = "contain", sx }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (!tokenUri) return null;

  const src = resolveImageSrc(tokenUri);
  if (!src) return null;

  if (error) {
    return (
      <Box
        sx={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "rgba(255,255,255,0.03)",
          ...sx,
        }}
      >
        <BrokenImageIcon sx={{ fontSize: 40, color: "text.disabled" }} />
      </Box>
    );
  }

  return (
    <Box sx={{ position: "relative", ...sx }}>
      {!loaded && (
        <Skeleton
          variant="rectangular"
          animation="wave"
          sx={{ height, width: "100%" }}
        />
      )}
      <Box
        component="img"
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        sx={{
          width: "100%",
          height,
          objectFit,
          display: loaded ? "block" : "none",
          bgcolor: "rgba(0,0,0,0.2)",
        }}
      />
    </Box>
  );
}
