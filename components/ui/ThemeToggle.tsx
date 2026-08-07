'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

type ThemePref = 'light' | 'dark' | 'system';

const OPTIONS: { value: ThemePref; icon: ReactNode; label: string }[] = [
  { value: 'light', icon: <Sun className="w-4 h-4" />, label: 'Light mode' },
  { value: 'system', icon: <Monitor className="w-4 h-4" />, label: 'Follow system' },
  { value: 'dark', icon: <Moon className="w-4 h-4" />, label: 'Dark mode' },
];

function readPref(): ThemePref {
  try {
    const s = localStorage.getItem('dheetantra-theme');
    if (s === 'light' || s === 'dark' || s === 'system') return s;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

function readSystemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  // Lazy initializers keep the first paint in sync with the init script's applied theme
  const [pref, setPref] = useState<ThemePref>(readPref);
  const [systemDark, setSystemDark] = useState(readSystemDark);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    if (mq.addListener) {
      mq.addListener(onChange);
      return () => mq.removeListener(onChange);
    }
  }, []);

  // Apply theme whenever preference or system scheme changes
  useEffect(() => {
    const dark = pref === 'dark' || (pref === 'system' && systemDark);
    const el = document.documentElement;
    if (el.classList.contains('dark') !== dark) {
      el.classList.toggle('dark', dark);
      window.dispatchEvent(new Event('dheetantra-themechange'));
    }
  }, [pref, systemDark]);

  const choose = (p: ThemePref) => {
    setPref(p);
    try {
      localStorage.setItem('dheetantra-theme', p);
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border border-surface-200 dark:border-surface-700 bg-white/80 dark:bg-surface-900/80 backdrop-blur p-1 shadow-sm',
        className
      )}
      role="group"
      aria-label="Theme"
    >
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => choose(opt.value)}
          title={opt.label}
          aria-label={opt.label}
          className={cn(
            'p-1.5 rounded-full transition-all',
            pref === opt.value
              ? 'bg-primary-600 text-white shadow'
              : 'text-surface-600 dark:text-surface-300 hover:text-surface-900 dark:hover:text-white'
          )}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
