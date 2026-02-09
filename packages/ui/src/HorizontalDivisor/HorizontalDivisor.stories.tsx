import type { Meta, StoryObj } from '@storybook/react';
import HorizontalDivisor from './HorizontalDivisor';

const meta = {
  title: 'Components/HorizontalDivisor',
  component: HorizontalDivisor,
  tags: ['autodocs'],
  argTypes: {
    margin: { control: 'number' },
  },
  args: {
    margin: 0,
  },
} satisfies Meta<typeof HorizontalDivisor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    margin: 0,
  },
};

export const WithMargin: Story = {
  args: {
    margin: 2,
  },
};

export const WithCustomStyling: Story = {
  args: {
    margin: 1,
    sx: {
      borderBottom: '2px solid #000',
      width: '80%',
    },
  },
};

export const WithLargeMargin: Story = {
  args: {
    margin: 4,
  },
};
