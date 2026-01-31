import { Component, ReactNode } from "react";
import { Box, Typography, Button } from "@mui/material";

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h5" gutterBottom>Something went wrong</Typography>
          <Button variant="contained" onClick={() => this.setState({ hasError: false })}>
            Try Again
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
