'use client';

import ButtonGroup from '@mui/material/ButtonGroup';
import Button from '@mui/material/Button';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import { useColorScheme } from '@mui/material/styles';
import { Language } from '@iguzman/helpers/types';
import IconButton from '@mui/material/IconButton';
import { useEffect, useMemo } from 'react';

/**
 * Props for ThemeModeToggle component
 * @example
 * ```tsx
 * <ThemeModeToggle language="es" mini={true} />
 * ```
 */
type ThemeModeToggleProps = {
  /** Whether to display mini icons instead of full buttons */
  mini?: boolean;
  /** Whether to make the button group full width */
  fullWidth?: boolean;
  /** Language for button labels */
  language?: Language;
};

/**
 * Theme mode toggle component that allows switching between light, dark, and system modes
 * @param props - Component props
 * @returns Theme mode toggle UI
 */
const ThemeModeToggle = ({
  mini = false,
  fullWidth = true,
  language = 'en',
}: ThemeModeToggleProps) => {
  const { mode, setMode } = useColorScheme();

  // Memoize the mode value to prevent unnecessary re-renders
  const currentMode = useMemo(() => mode, [mode]);

  // Handle system mode by defaulting to light mode
  useEffect(() => {
    if (currentMode === 'system') {
      setMode('light');
    }
  }, [currentMode, setMode]);

  // Get translated labels based on language
  const labels = useMemo(() => {
    return {
      light: language === 'en' ? 'Light' : 'Claro',
      dark: language === 'en' ? 'Dark' : 'Obscuro',
    };
  }, [language]);

  if (mini) {
    return (
      <>
        <IconButton
          aria-label="light"
          onClick={() => setMode('light')}
          sx={{
            color: currentMode === 'light' ? 'primary.main' : 'gray',
          }}
        >
          <LightModeIcon />
        </IconButton>
        <IconButton
          aria-label="dark"
          onClick={() => setMode('dark')}
          sx={{
            color: currentMode === 'dark' ? 'primary.main' : 'gray',
          }}
        >
          <DarkModeIcon />
        </IconButton>
      </>
    );
  }

  return (
    <ButtonGroup
      variant="outlined"
      aria-label="mode"
      fullWidth={fullWidth}
      sx={{
        bgcolor: 'white',
      }}
    >
      <Button
        size="medium"
        variant={currentMode === 'light' ? 'contained' : 'outlined'}
        startIcon={<LightModeIcon />}
        onClick={() => setMode('light')}
        sx={{
          textTransform: 'initial',
        }}
      >
        {labels.light}
      </Button>
      <Button
        size="medium"
        variant={currentMode === 'dark' ? 'contained' : 'outlined'}
        startIcon={<DarkModeIcon />}
        onClick={() => setMode('dark')}
        sx={{
          textTransform: 'initial',
        }}
      >
        {labels.dark}
      </Button>
    </ButtonGroup>
  );
};

export default ThemeModeToggle;
