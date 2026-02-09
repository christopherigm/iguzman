import type { Meta, StoryObj } from '@storybook/react';
import ScrollToBottom from './scroll-to-bottom';

const meta = {
  title: 'Components/ScrollToBottom',
  component: ScrollToBottom,
  tags: ['autodocs'],
  argTypes: {
    scrollToBottomOnMount: { control: 'boolean' },
    scrollToBottomOnUpdate: { control: 'boolean' },
    scrollBehavior: { control: 'radio', options: ['auto', 'smooth'] },
  },
  args: {
    scrollToBottomOnMount: true,
    scrollToBottomOnUpdate: false,
    scrollBehavior: 'smooth',
  },
} satisfies Meta<typeof ScrollToBottom>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    scrollToBottomOnMount: true,
    scrollBehavior: 'smooth',
  },
};

export const AutoScroll: Story = {
  args: {
    scrollToBottomOnMount: true,
    scrollBehavior: 'auto',
  },
};

export const NoAutoScroll: Story = {
  args: {
    scrollToBottomOnMount: false,
    scrollToBottomOnUpdate: true,
  },
};
