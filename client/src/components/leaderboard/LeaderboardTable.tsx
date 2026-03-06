import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography } from "@mui/material";

interface Entry {
  rank: number;
  tokenId: string;
  ownerAddress: string;
  playerName: string | null;
  score: string;
}

interface Props {
  entries: Entry[];
}

export default function LeaderboardTable({ entries }: Props) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Rank</TableCell>
            <TableCell>Player</TableCell>
            <TableCell align="right">Score</TableCell>
            <TableCell>Owner</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} sx={{ textAlign: "center", py: 4 }}>
                <Typography color="text.secondary">
                  No entries yet. Be the first to play!
                </Typography>
              </TableCell>
            </TableRow>
          )}
          {entries.map((entry) => (
            <TableRow key={entry.tokenId} hover>
              <TableCell>
                <Typography fontWeight={entry.rank <= 3 ? 700 : 400}>
                  #{entry.rank}
                </Typography>
              </TableCell>
              <TableCell>{entry.playerName || entry.tokenId.slice(0, 10) + "..."}</TableCell>
              <TableCell align="right">
                <Typography fontWeight={600}>
                  {Number(entry.score).toLocaleString()}
                </Typography>
              </TableCell>
              <TableCell sx={{ opacity: 0.7 }}>
                {entry.ownerAddress.slice(0, 6)}...{entry.ownerAddress.slice(-4)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
