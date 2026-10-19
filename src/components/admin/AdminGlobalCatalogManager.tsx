'use client';

import React from 'react';

// This component has been deprecated. The global catalog feature is not yet
// implemented in the backend (FallbackStore). It is kept as a stub to avoid
// import errors if referenced.
export const AdminGlobalCatalogManager: React.FC = () => {
  return (
    <div className="p-6 text-center text-gray-500 text-sm">
      কেন্দ্রীয় ক্যাটালগ বর্তমানে উপলব্ধ নয়।
    </div>
  );
};
