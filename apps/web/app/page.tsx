import { ThemeSwitch } from '@repo/ui/theme-switch';
import { Switch } from '@repo/ui/switch';
import { Icon } from '@repo/ui/icon';
import { Box } from '@repo/ui/box';

export default function Home() {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      styles={{
        minHeight: '100vh',
      }}
    >
      <Box
        width={360}
        padding={32}
        borderRadius={12}
        flexDirection="column"
        alignItems="center"
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--foreground)',
            margin: 0,
          }}
        >
          Theme Mode
        </h2>
        <ThemeSwitch />
        <Switch />
        <Icon
          icon="/icons/cloud-rain-alt-svgrepo-com.svg"
          size={50}
          padding={5}
          backgroundColor="var(--surface-2)"
          backgroundShape="circle"
        />
        <Box
          marginTop={20}
          width="100%"
          elevation={5}
          borderRadius={8}
          padding={10}
        >
          Content
        </Box>
      </Box>
    </Box>
  );
}
