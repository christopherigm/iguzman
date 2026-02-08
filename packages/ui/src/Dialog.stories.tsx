import type { Meta, StoryObj } from '@storybook/react';
import { Dialog } from './Dialog';

const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  argTypes: {
    language: { control: 'radio', options: ['en', 'es'] },
    open: { control: 'boolean' },
    cancelEnabled: { control: 'boolean' },
    title: { control: 'text' },
    text: { control: 'text' },
  },
  args: {
    language: 'en',
    open: false,
    title: 'Dialog Title',
    text: 'Dialog content text',
    cancelEnabled: true,
    onAgreed: () => console.log('Agreed'),
    onCancel: () => console.log('Cancelled'),
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    title: 'Confirmation',
    text: 'Are you sure you want to proceed?',
  },
};

export const WithChildren: Story = {
  args: {
    open: true,
    title: 'Custom Content',
    children: <p>This is custom content inside the dialog</p>,
  },
};

export const WithoutCancel: Story = {
  args: {
    open: true,
    title: 'No Cancel',
    text: 'This dialog cannot be cancelled',
    cancelEnabled: false,
  },
};

export const Spanish: Story = {
  args: {
    open: true,
    language: 'es',
    title: 'Confirmación',
    text: '¿Está seguro de que desea continuar?',
  },
};
