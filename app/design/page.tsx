import { Suspense } from 'react';
import DesignPageContent from './DesignPageContent';

export default function DesignPage() {
  return (
    <Suspense fallback={null}>
      <DesignPageContent />
    </Suspense>
  );
}
