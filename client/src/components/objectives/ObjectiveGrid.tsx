import { Grid } from "@mui/material";
import ObjectiveCard from "./ObjectiveCard";

interface Props {
  objectives: any[];
}

export default function ObjectiveGrid({ objectives }: Props) {
  return (
    <Grid container spacing={3}>
      {objectives.map((objective, index) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={`${objective.gameAddress}-${objective.id}`}>
          <ObjectiveCard objective={objective} index={index} />
        </Grid>
      ))}
    </Grid>
  );
}
