import { Grid } from "@mui/material";
import TokenCard from "./TokenCard";

interface Props {
  tokens: any[];
}

export default function TokenGrid({ tokens }: Props) {
  return (
    <Grid container spacing={2}>
      {tokens.map((token) => (
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={token.tokenId}>
          <TokenCard token={token} />
        </Grid>
      ))}
    </Grid>
  );
}
