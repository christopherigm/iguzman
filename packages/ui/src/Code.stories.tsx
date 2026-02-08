import type { Meta, StoryObj } from '@storybook/react';
import { Code } from './Code';

const meta = {
  title: 'Components/Code',
  component: Code,
  tags: ['autodocs'],
  argTypes: {
    children: { control: 'text' },
  },
  args: { children: 'code snippet' },
} satisfies Meta<typeof Code>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'console.log("hello")' },
};

export const WithCustomClassName: Story = {
  args: {
    children: 'import { Button } from "@iguzman/ui/Button"',
    className: 'bg-gray-100 p-2 rounded',
  },
};

export const Empty: Story = {
  args: { children: undefined },
};
