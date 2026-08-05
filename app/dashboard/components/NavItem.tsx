import React from 'react';

export function NavItem({ icon, label, isActive, onClick, badge }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, badge?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
        isActive 
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' 
          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`}>
          {icon}
        </span>
        {label}
      </div>
      {badge && (
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white text-indigo-600' : 'bg-zinc-800 text-zinc-300'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

