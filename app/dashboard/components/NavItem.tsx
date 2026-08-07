import React from 'react';

export function NavItem({ icon, label, isActive, onClick, badge }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, badge?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
        isActive 
          ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20' 
          : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800/50 hover:text-surface-900 dark:hover:text-white'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-surface-500 dark:text-surface-400'}`}>
          {icon}
        </span>
        {label}
      </div>
      {badge && (
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white text-primary-600' : 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

