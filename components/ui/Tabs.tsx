'use client';

import { type ReactNode, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab?: string;
  onChange?: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  const [internalActive, setInternalActive] = useState(tabs[0]?.id || '');
  const selected = activeTab ?? internalActive;

  return (
    <div className={cn('flex gap-1 bg-surface-100 dark:bg-surface-800/50 p-1 rounded-xl', className)}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => {
            setInternalActive(tab.id);
            onChange?.(tab.id);
          }}
          className={cn(
            'relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            selected === tab.id
              ? 'text-surface-900 dark:text-surface-100'
              : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300'
          )}
        >
          {selected === tab.id && (
            <motion.div
              layoutId="tab-indicator"
              className="absolute inset-0 bg-white dark:bg-surface-700 rounded-lg shadow-sm"
              transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            {tab.icon}
            {tab.label}
            {tab.badge && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-[10px] font-bold px-1">
                {tab.badge}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
