"use client";

import { Navbar } from "@repo/ui/core-elements/navbar";

interface NavbarWrapperProps {
  logo: string;
  version: string;
  labels: { home: string; account: string; signOut: string };
}

export function NavbarWrapper({ logo, version, labels }: NavbarWrapperProps) {
  return (
    <Navbar
      logo={logo}
      items={[{ label: labels.home, href: "/" }]}
      fixedItems={[]}
      version={version}
      translucent
    />
  );
}
