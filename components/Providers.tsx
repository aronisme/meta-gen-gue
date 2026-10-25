'use client';

import { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      {children}
      <Toaster richColors position="bottom-right" closeButton duration={3500} />
    </ErrorBoundary>
  );
}

