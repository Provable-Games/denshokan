import { Box, Card, CardContent, Grid, Skeleton } from "@mui/material";

export function GameCardSkeleton() {
  return (
    <Card variant="outlined">
      <Skeleton variant="rectangular" height={160} />
      <CardContent>
        <Skeleton variant="text" width="60%" />
        <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
          <Skeleton variant="rectangular" width={60} height={24} sx={{ borderRadius: 12 }} />
          <Skeleton variant="rectangular" width={60} height={24} sx={{ borderRadius: 12 }} />
        </Box>
      </CardContent>
    </Card>
  );
}

export function TokenCardSkeleton() {
  return (
    <Card variant="outlined">
      <Skeleton variant="rectangular" sx={{ aspectRatio: 1, width: "100%", height: "auto" }} />
      <CardContent>
        <Skeleton variant="text" width="80%" />
        <Skeleton variant="text" width="40%" />
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card variant="outlined">
      <CardContent sx={{ textAlign: "center" }}>
        <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
          <Skeleton variant="circular" width={32} height={32} />
        </Box>
        <Box sx={{ display: "flex", justifyContent: "center", mb: 0.5 }}>
          <Skeleton variant="text" width="40%" />
        </Box>
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Skeleton variant="text" width="60%" />
        </Box>
      </CardContent>
    </Card>
  );
}

export function GameCardSkeletonGrid() {
  return (
    <Grid container spacing={3}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
          <GameCardSkeleton />
        </Grid>
      ))}
    </Grid>
  );
}

export function TokenCardSkeletonGrid() {
  return (
    <Grid container spacing={1}>
      {Array.from({ length: 8 }).map((_, i) => (
        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={i}>
          <TokenCardSkeleton />
        </Grid>
      ))}
    </Grid>
  );
}

export function StatCardSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <Grid container spacing={2}>
      {Array.from({ length: count }).map((_, i) => (
        <Grid size={{ xs: 6, sm: 3 }} key={i}>
          <StatCardSkeleton />
        </Grid>
      ))}
    </Grid>
  );
}
