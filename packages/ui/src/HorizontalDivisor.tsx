import Box from '@mui/material/Box';
import type { SxProps } from '@mui/material';

/**
 * Props for the {@link HorizontalDivisor} component.
 */
export interface HorizontalDivisorProps {
  /**
   * The margin to apply to the top and bottom of the divisor.
   * @default 0
   */
  margin?: number;

  /**
   * The CSS styling to apply to the component.
   */
  sx?: SxProps;
}

/**
 * A horizontal line divider component that can be customized with margin and styling.
 *
 * This component renders a horizontal line using MUI's Box component with a
 * consistent border style and customizable spacing.
 *
 * @example
 * ```tsx
 * import { HorizontalDivisor } from '@iguzman/ui/HorizontalDivisor';
 *
 * function Example() {
 *   return (
 *     <div>
 *       <p>Content before</p>
 *       <HorizontalDivisor margin={2} />
 *       <p>Content after</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function HorizontalDivisor({ margin = 0, sx }: HorizontalDivisorProps) {
  return (
    <Box
      marginTop={margin}
      marginBottom={margin}
      borderBottom="1px solid #ddd"
      width="100%"
      sx={sx}
    />
  );
}

export default HorizontalDivisor;
