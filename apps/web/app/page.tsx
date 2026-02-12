import { ThemeSwitch } from '@repo/ui/theme-switch';
import { Switch } from '@repo/ui/switch';

export default function Home() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          width: 360,
          padding: 32,
          borderRadius: 12,
          border: '1px solid var(--border, #e5e7eb)',
          background: 'var(--surface-1, #f5f5f5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
        }}
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
      </div>
    </div>
  );
}
