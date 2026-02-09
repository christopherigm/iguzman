import type { Meta, StoryObj } from '@storybook/react';
import GenericImage from './GenericImage';

const imgPicture =
  'https://thumbs.dreamstime.com/b/colorado-flag-icon-isolated-white-background-image-features-which-consists-three-horizontal-stripes-blue-431257409.jpg';
const meta: Meta<typeof GenericImage> = {
  title: 'Components/GenericImage',
  component: GenericImage,
  tags: ['autodocs'],
  argTypes: {
    imgPicture: {
      description: 'Image source URL',
      control: 'text',
    },
    name: {
      description: 'Image name/title',
      control: 'text',
    },
    fit: {
      description: 'Image object fit property',
      control: 'select',
      options: ['fill', 'contain', 'cover', 'none', 'scale-down'],
    },
    blurOverlay: {
      description: 'Blur overlay intensity (0-20px)',
      control: 'number',
      min: 0,
      max: 20,
    },
    backgroundColor: {
      description: 'Background color for the container',
      control: 'color',
    },
    borderRadius: {
      description: 'Border radius for the container',
      control: 'number',
    },
    imgLoading: {
      description: 'Image loading strategy',
      control: 'select',
      options: ['eager', 'lazy'],
    },
    opacity: {
      description: 'Image opacity',
      control: 'number',
      min: 0,
      max: 1,
    },
  },
};

export default meta;
type Story = StoryObj<typeof GenericImage>;

export const Default: Story = {
  args: {
    imgPicture,
    name: 'Sample Image',
    fit: 'cover',
    blurOverlay: 0,
    backgroundColor: '',
    borderRadius: 0,
    imgLoading: 'lazy',
    opacity: 1,
    unoptimized: true,
  },
};

export const WithBlurOverlay: Story = {
  args: {
    imgPicture,
    name: 'Image with Blur',
    fit: 'cover',
    blurOverlay: 5,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    unoptimized: true,
  },
};

export const WithCustomSize: Story = {
  args: {
    imgPicture,
    name: 'Custom Size Image',
    fit: 'cover',
    width: { xs: '100%', sm: 500, md: 600 },
    height: { xs: 200, sm: 300, md: 400 },
    borderRadius: 12,
    unoptimized: true,
  },
};

export const WithNamePosition: Story = {
  args: {
    imgPicture,
    name: 'Left Aligned Name',
    fit: 'cover',
    namePosition: 'left',
    blurOverlay: 3,
    unoptimized: true,
  },
};
