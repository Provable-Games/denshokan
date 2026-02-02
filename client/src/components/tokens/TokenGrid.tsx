import { Grid } from "@mui/material";
import { motion } from "framer-motion";
import TokenCard from "./TokenCard";

interface Props {
  tokens: any[];
}

export default function TokenGrid({ tokens }: Props) {
  return (
    <Grid container spacing={2}>
      {tokens.map((token, i) => (
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={token.tokenId}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <TokenCard token={token} />
          </motion.div>
        </Grid>
      ))}
    </Grid>
  );
}
