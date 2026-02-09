import type { Meta, StoryObj } from '@storybook/react';
import ThemeModeToggle from './ThemeModeToggle';

const meta: Meta<typeof ThemeModeToggle> = {
  title: 'Components/ThemeModeToggle',
  component: ThemeModeToggle,
  tags: ['autodocs'],
  argTypes: {
    mini: {
      control: 'boolean',
      description: 'Whether to display mini icons instead of full buttons',
    },
    fullWidth: {
      control: 'boolean',
      description: 'Whether to make the button group full width',
    },
    language: {
      control: 'radio',
      options: ['en', 'es'],
      description: 'Language for button labels',
    },
  },
  args: {
    mini: false,
    fullWidth: true,
    language: 'en',
  },
};

export default meta;
type Story = StoryObj<typeof ThemeModeToggle>;

export const Default: Story = {
  args: {
    mini: false,
    fullWidth: true,
    language: 'en',
  },
};

export const Mini: Story = {
  args: {
    mini: true,
    fullWidth: false,
    language: 'es',
  },
};

export const LightMode: Story = {
  args: {
    mini: false,
    fullWidth: true,
    language: 'en',
  },
};

export const DarkMode: Story = {
  args: {
    mini: false,
    fullWidth: true,
    language: 'en',
  },
};
