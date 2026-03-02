import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
} from "@mui/material";
import TimelineIcon from "@mui/icons-material/Timeline";
import EmptyState from "../common/EmptyState";

interface ScoreEntry {
  score: number;
  timestamp: string;
}

interface Props {
  scores: ScoreEntry[];
}

export default function ScoreHistoryTable({ scores }: Props) {
  if (scores.length === 0) {
    return <EmptyState title="No score history" description="Score updates will appear here" />;
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <TimelineIcon fontSize="small" color="primary" />
          <Typography variant="overline" color="text.secondary">
            Score History
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Score</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  Change
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {scores.map((s, i) => {
                const prev = i < scores.length - 1 ? scores[i + 1].score : 0;
                const delta = Number(s.score) - Number(prev);
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {Number(s.score).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(s.timestamp).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          color:
                            delta > 0
                              ? "success.main"
                              : delta < 0
                                ? "error.main"
                                : "text.secondary",
                          fontWeight: 500,
                        }}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta.toLocaleString()}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}
