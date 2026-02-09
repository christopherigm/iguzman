import Link from 'next/link';
import type { HTMLAttributes } from 'react';

import APIGetBaseURLFromEnv from '@iguzman/helpers/get-api-base-url';
import APIGetK8sBaseURLFromEnv from '@iguzman/helpers/get-k8s-api-base-url';

import Box from '@mui/material/Box';

/**
 * Props for the {@link Logo} component.
 * Extends HTMLAttributes<HTMLElement> but excludes 'children' to enforce
 * explicit content passing.
 */
export interface LogoProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'children'
> {
  /** The source URL for the logo image */
  src?: string;
  /** Width of the logo */
  width?: number;
  /** Whether the logo should take full width */
  fullWidth?: boolean;
  /** Whether to show the logo always regardless of screen size */
  showAlways?: boolean;
}

/**
 * Logo component that renders a logo image with customizable properties.
 *
 * @example
 * ```tsx
 * import { Logo } from '@iguzman/ui/Logo';
 *
 * function Example() {
 *   return (
 *     <Logo src="/logo.svg" width={150} />
 *   );
 * }
 * ```
 *
 * @param props - The props for the Logo component
 * @returns The rendered Logo component or null if no logo source is provided
 */
const Logo = ({
  src = '',
  width = 100,
  fullWidth = false,
  showAlways = false,
  ...rest
}: LogoProps) => {
  // Get base URLs from environment
  const baseURL = APIGetBaseURLFromEnv();
  const k8sBaseURL = APIGetK8sBaseURLFromEnv();

  // Determine the logo source
  const logoSource =
    src ||
    process.env.NEXT_PUBLIC_LOGO?.trim() ||
    process.env.LOGO?.trim() ||
    '';

  // Return null if no logo source is provided
  if (!logoSource) {
    return null;
  }

  // Replace K8s base URL with API base URL
  const finalLogoSrc = logoSource.replaceAll(k8sBaseURL, baseURL);

  return (
    <Link href="/" prefetch>
      <Box
        className="Logo"
        sx={{
          backgroundPosition: fullWidth ? 'center' : 'left',
          backgroundImage: `url(${finalLogoSrc})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
        }}
        width={fullWidth ? '100%' : width}
        height={{
          xs: 40,
          sm: 45,
        }}
        display={{
          xs: fullWidth || showAlways ? 'inline-flex' : 'none',
          sm: 'inline-flex',
        }}
        {...rest}
      />
    </Link>
  );
};

export default Logo;
