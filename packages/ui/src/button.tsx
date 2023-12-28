'use client';

import { ReactNode, ReactElement } from 'react';

type ButtonProps = {
  children: ReactNode;
  className?: string;
  appName: string;
  callBack: () => void;
};

export const Button = ({
  children,
  className,
  appName,
}: ButtonProps): ReactElement => {
  return (
    <button
      className={className}
      onClick={() => alert(`Hello from your ${appName} app!`)}
    >
      {children}
    </button>
  );
};
