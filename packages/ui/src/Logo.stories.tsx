import type { Meta, StoryObj } from '@storybook/react';
import { Logo } from './Logo';

const meta = {
  title: 'Components/Logo',
  component: Logo,
  tags: ['autodocs'],
  argTypes: {
    src: { control: 'text' },
    width: { control: 'number' },
    fullWidth: { control: 'boolean' },
    showAlways: { control: 'boolean' },
  },
  args: {
    src: '/logo.svg',
    width: 100,
    fullWidth: false,
    showAlways: false,
  },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    src: '/logo.svg',
  },
};

export const FullWidth: Story = {
  args: {
    src: '/logo.svg',
    fullWidth: true,
  },
};

export const WithCustomWidth: Story = {
  args: {
    src: '/logo.svg',
    width: 150,
  },
};

export const ShowAlways: Story = {
  args: {
    src: '/logo.svg',
    showAlways: true,
  },
};

export const Empty: Story = {
  args: {
    src: '',
  },
};
