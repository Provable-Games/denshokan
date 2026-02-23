import { Stack, Chip } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import DataObjectIcon from "@mui/icons-material/DataObject";
import PaymentIcon from "@mui/icons-material/Payment";
import TimerIcon from "@mui/icons-material/Timer";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import type { ClientToken } from "../../hooks/useTokenDetail";

interface Props {
  token: ClientToken;
  isGameOver: boolean;
}

export default function TokenPropertiesChips({ token, isGameOver }: Props) {
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
      <Chip
        label={isGameOver ? "Completed" : "Active"}
        color={isGameOver ? "success" : "primary"}
        size="small"
      />
      {token.isPlayable && !isGameOver && (
        <Chip
          icon={<PlayCircleIcon />}
          label="Playable"
          color="info"
          size="small"
          variant="outlined"
        />
      )}
      {isGameOver && (
        <Chip
          icon={<StopCircleIcon />}
          label="Game Over"
          size="small"
          variant="outlined"
          color="warning"
        />
      )}
      {token.soulbound && (
        <Chip
          icon={<LockIcon />}
          label="Soulbound"
          size="small"
          variant="outlined"
        />
      )}
      {token.hasContext && (
        <Chip
          icon={<DataObjectIcon />}
          label="Has Context"
          size="small"
          variant="outlined"
        />
      )}
      {token.paymaster && (
        <Chip
          icon={<PaymentIcon />}
          label="Paymaster"
          size="small"
          variant="outlined"
        />
      )}
      {token.startDelay > 0 && (
        <Chip
          icon={<TimerIcon />}
          label={`Start +${token.startDelay}s`}
          size="small"
          variant="outlined"
        />
      )}
      {token.endDelay > 0 && (
        <Chip
          icon={<TimerIcon />}
          label={`End +${token.endDelay}s`}
          size="small"
          variant="outlined"
        />
      )}
    </Stack>
  );
}
