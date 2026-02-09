import type { Meta, StoryObj } from '@storybook/react';
import Logo from './Logo';

const src =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Flag_of_Colorado.svg/1920px-Flag_of_Colorado.svg.png';

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
    src,
    width: 100,
    fullWidth: false,
    showAlways: false,
  },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    src,
  },
};

export const FullWidth: Story = {
  args: {
    src,
    fullWidth: true,
  },
};

export const WithCustomWidth: Story = {
  args: {
    src,
    width: 150,
  },
};

export const ShowAlways: Story = {
  args: {
    src,
    showAlways: true,
  },
};

export const Empty: Story = {
  args: {
    src: '',
  },
};
