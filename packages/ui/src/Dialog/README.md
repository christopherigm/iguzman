# Dialog Component Documentation

## Purpose

The Dialog component is a customizable dialog that displays a message with action buttons. It provides a way to show important information or confirm actions to the user with options to agree or cancel.

## Props

- `children` (React.ReactNode, optional): The content to display inside the dialog
- `language` (Language): The language for localization (en or es)
- `title` (string): The title of the dialog
- `text` (string, optional): The text content of the dialog
- `open` (boolean): Whether the dialog is open
- `onAgreed` (function): Callback function when user agrees
- `onCancel` (function, optional): Callback function when user cancels
- `cancelEnabled` (boolean, optional): Whether the cancel button is enabled (default: true)

## Usage

```tsx
import { Dialog } from '@iguzman/ui/Dialog';

function MyComponent() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open Dialog</button>
      <Dialog
        open={open}
        title="Confirmation"
        language="en"
        onAgreed={() => console.log('Agreed')}
        onCancel={() => setOpen(false)}
      >
        Are you sure you want to proceed?
      </Dialog>
    </>
  );
}
```

## Implementation Details

The component uses Material-UI's Dialog, DialogTitle, DialogContent, and DialogActions components. It handles the open state and displays either English or Spanish text based on the language prop. The component renders a cancel button only when cancelEnabled is true, and always renders an OK button.
