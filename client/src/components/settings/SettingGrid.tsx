import { Grid } from "@mui/material";
import SettingCard from "./SettingCard";

interface Props {
  settings: any[];
}

export default function SettingGrid({ settings }: Props) {
  return (
    <Grid container spacing={3}>
      {settings.map((setting, index) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={`${setting.gameAddress}-${setting.settingsId}`}>
          <SettingCard setting={setting} index={index} />
        </Grid>
      ))}
    </Grid>
  );
}
