import type { HTMLAttributes, ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * Props for the {@link Code} component.
 * Extends HTMLAttributes<HTMLElement> but excludes 'children' to enforce
 * explicit content passing.
 */
export interface CodeProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'children'
> {
  /** Content to render inside the `<code>` element. */
  children: ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * Renders a `<code>` element for displaying code blocks or snippets.
 *
 * This component is designed to be used for inline code elements and
 * provides consistent styling and accessibility features.
 *
 * @example
 * ```tsx
 * import { Code } from '@iguzman/ui/Code';
 *
 * function Example() {
 *   return (
 *     <p>
 *       The function <Code>calculateTotal()</Code> returns the sum.
 *     </p>
 *   );
 * }
 * ```
 */
const Code = ({ children, ...rest }: CodeProps) => {
  // Handle case where children might be undefined or null
  if (children === undefined || children === null) {
    return <code {...rest} />;
  }

  return <code {...rest}>{children}</code>;
};

export default Code;
