'use client';

import React from 'react';

interface MainNavProps {
  title: string;
}

const MainNav: React.FC<MainNavProps> = ({ title }) => {
  return (
    <div className="h-0 flex items-center border-b min-w-0">
      <div className="max-w-5xl mx-auto w-full min-w-0 px-8">
        <h1 className="text-2xl font-semibold truncate">{title}</h1>
      </div>
    </div>
  );
};

export default MainNav;
