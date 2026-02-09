import type { Meta, StoryObj } from '@storybook/react';
import Spacer from './Spacer';

const meta = {
  title: 'Components/Spacer',
  component: Spacer,
  tags: ['autodocs'],
  argTypes: {
    height: {
      control: 'number',
      description: 'Height of the spacer in pixels',
    },
  },
  args: { height: 15 },
} satisfies Meta<typeof Spacer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { height: 15 },
};

export const Small: Story = {
  args: { height: 5 },
};

export const Medium: Story = {
  args: { height: 25 },
};

export const Large: Story = {
  args: { height: 50 },
};
