'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

export interface AsyncButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => Promise<unknown> | void;
  isLoading?: boolean;
  loadingText?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export const AsyncButton: React.FC<AsyncButtonProps> = ({
  onClick,
  isLoading: externalIsLoading,
  loadingText,
  icon,
  children,
  disabled,
  className = '',
  type = 'button',
  ...props
}) => {
  const [internalIsLoading, setInternalIsLoading] = useState(false);

  const isLoading = externalIsLoading !== undefined ? externalIsLoading : internalIsLoading;

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isLoading || disabled) {
      e.preventDefault();
      return;
    }

    if (onClick) {
      try {
        const result = onClick(e);
        if (result && typeof (result as any).then === 'function') {
          setInternalIsLoading(true);
          await result;
        }
      } catch (error) {
        console.error('AsyncButton onClick error:', error);
      } finally {
        setInternalIsLoading(false);
      }
    }
  };

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || isLoading}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center transition-all disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" />
          <span>{loadingText || children}</span>
        </>
      ) : (
        <>
          {icon && <span className="mr-2 shrink-0">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
};
