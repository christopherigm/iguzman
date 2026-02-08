import type { Meta, StoryObj } from '@storybook/react';
import useModal from './useModal';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

const meta = {
  title: 'Hooks/useModal',
  component: () => null,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A custom hook that provides a modal component and its state management.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const { Component: ModalComponent, open, setOpen } = useModal();

    return (
      <>
        <Button variant="contained" onClick={() => setOpen(true)}>
          Open Modal
        </Button>
        <ModalComponent
          title="Example Modal"
          OKButtonText="Confirm"
          OKButtonCallback={() => console.log('Confirmed')}
          cancelButtonText="Close"
        >
          <Typography variant="body1">
            This is an example modal content.
          </Typography>
        </ModalComponent>
      </>
    );
  },
};

export const ModalWithoutButtons: Story = {
  render: () => {
    const { Component: ModalComponent, open, setOpen } = useModal();

    return (
      <>
        <Button variant="contained" onClick={() => setOpen(true)}>
          Open Modal (No Buttons)
        </Button>
        <ModalComponent title="Modal Without Buttons">
          <Typography variant="body1">
            This modal has no action buttons.
          </Typography>
        </ModalComponent>
      </>
    );
  },
};

export const ModalWithCustomContent: Story = {
  render: () => {
    const { Component: ModalComponent, open, setOpen } = useModal();

    return (
      <>
        <Button variant="contained" onClick={() => setOpen(true)}>
          Open Custom Modal
        </Button>
        <ModalComponent
          title="Custom Content Modal"
          OKButtonText="Save"
          cancelButtonText="Cancel"
        >
          <div style={{ padding: '16px' }}>
            <Typography variant="h6">Custom Form</Typography>
            <input
              type="text"
              placeholder="Enter your name"
              style={{ width: '100%', padding: '8px', margin: '8px 0' }}
            />
            <textarea
              placeholder="Enter your message"
              style={{ width: '100%', padding: '8px', margin: '8px 0' }}
            />
          </div>
        </ModalComponent>
      </>
    );
  },
};
