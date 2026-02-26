import { Grid } from "@mui/material";
import { motion } from "framer-motion";
import TokenCard from "./TokenCard";

interface Props {
  tokens: any[];
  variant?: "full" | "image";
}

const gridSizes = {
  full: { xs: 12, sm: 6, md: 4, lg: 3 },
  image: { xs: 6, sm: 4, md: 3, lg: 2 },
};

export default function TokenGrid({ tokens, variant = "full" }: Props) {
  return (
    <Grid container spacing={variant === "image" ? 1 : 2}>
      {tokens.map((token, i) => (
        <Grid size={gridSizes[variant]} key={token.tokenId}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <TokenCard token={token} variant={variant} />
          </motion.div>
        </Grid>
      ))}
    </Grid>
  );
}
