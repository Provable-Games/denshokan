import { Grid } from "@mui/material";
import MinterCard from "./MinterCard";

interface Props {
  minters: any[];
}

export default function MinterGrid({ minters }: Props) {
  return (
    <Grid container spacing={3}>
      {minters.map((minter) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={minter.id}>
          <MinterCard minter={minter} />
        </Grid>
      ))}
    </Grid>
  );
}
