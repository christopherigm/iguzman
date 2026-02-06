'use client';

import { Container, Typography, Box } from '@mui/material';
import { Button } from '@iguzman/ui';

export default function Home() {
  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 2,
        }}
      >
        <Typography variant="h3" component="h1">
          Hello World
        </Typography>
        <Button
          variant="contained"
          onClick={() => alert('Hello from @iguzman/ui!')}
        >
          Click Me
        </Button>
      </Box>
    </Container>
  );
}
