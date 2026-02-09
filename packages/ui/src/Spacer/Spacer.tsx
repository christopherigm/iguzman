import Box, { BoxProps } from '@mui/material/Box';

/**
 * Props for the {@link Spacer} component.
 * Extends BoxProps to allow all MUI Box component props.
 */
export interface SpacerProps extends BoxProps {
  /**
   * The height of the spacer in pixels.
   * @default 15
   */
  height?: number;
}

/**
 * A reusable spacer component that renders a vertical space using MUI Box.
 *
 * This component is designed to create consistent vertical spacing throughout
 * the application. It's particularly useful for creating visual separation
 * between UI elements.
 *
 * @example
 * ```tsx
 * import { Spacer } from '@iguzman/ui/Spacer';
 *
 * function Example() {
 *   return (
 *     <>
 *       <p>First content</p>
 *       <Spacer height={20} />
 *       <p>Second content</p>
 *     </>
 *   );
 * }
 * ```
 */
const Spacer = ({ height = 15, ...rest }: SpacerProps) => {
  // Validate height to ensure it's a positive number
  const validatedHeight = height > 0 ? height : 0;

  return <Box height={validatedHeight} {...rest} />;
};

export default Spacer;
