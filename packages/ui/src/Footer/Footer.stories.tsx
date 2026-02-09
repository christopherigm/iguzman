import type { Meta, StoryObj } from '@storybook/react';
import Footer from './Footer';

const meta = {
  title: 'Components/Footer',
  component: Footer,
  tags: ['autodocs'],
  argTypes: {
    language: { control: 'radio', options: ['en', 'es'] },
    brandName: { control: 'text' },
    tagline: { control: 'text' },
    github: { control: 'text' },
    linkedin: { control: 'text' },
    twitter: { control: 'text' },
    email: { control: 'text' },
    bgColor: { control: 'color' },
  },
  args: {
    language: 'en',
    brandName: 'iguzman',
    github: 'https://github.com/iguzman',
    onLanguageChange: (lang: string) => console.log('Language changed:', lang),
  },
} satisfies Meta<typeof Footer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithAllSocialLinks: Story = {
  args: {
    brandName: 'Acme Inc.',
    tagline: 'Building the future, one line at a time.',
    github: 'https://github.com/acme',
    linkedin: 'https://linkedin.com/company/acme',
    twitter: 'https://x.com/acme',
    email: 'hello@acme.com',
  },
};

export const Spanish: Story = {
  args: {
    language: 'es',
    brandName: 'iguzman',
    github: 'https://github.com/iguzman',
  },
};

export const CustomSections: Story = {
  args: {
    brandName: 'DevTools',
    sections: [
      {
        title: 'Platform',
        links: [
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Analytics', href: '/analytics' },
          { label: 'Integrations', href: '/integrations' },
        ],
      },
      {
        title: 'Support',
        links: [
          { label: 'Help Center', href: '/help' },
          { label: 'Status', href: '/status' },
          { label: 'Contact', href: '/contact' },
        ],
      },
    ],
  },
};

export const MinimalNoSocial: Story = {
  args: {
    brandName: 'Minimal Co.',
    tagline: 'Less is more.',
  },
};
