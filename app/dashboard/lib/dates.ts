export const getUserTimezone = () => {
  if (typeof window === 'undefined') return 'Asia/Kolkata';
  return localStorage.getItem('userTimezone')
    || Intl.DateTimeFormat().resolvedOptions().timeZone
    || 'Asia/Kolkata';
};

export const ensureUTC = (dateStr: string | Date | number) => {
  if (typeof dateStr === 'string') {
    // Already has timezone info
    if (dateStr.endsWith('Z') || dateStr.match(/[+-]\d{2}:\d{2}$/)) {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    // SQLite format: "2024-01-01 12:00:00" or with milliseconds
    if (dateStr.includes(' ') && !dateStr.includes('T')) {
      const d = new Date(dateStr.replace(' ', 'T') + 'Z');
      return isNaN(d.getTime()) ? new Date() : d;
    }
    // ISO-like but missing Z: "2024-01-01T12:00:00"
    if (dateStr.includes('T')) {
      const d = new Date(dateStr + 'Z');
      return isNaN(d.getTime()) ? new Date() : d;
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

export const formatUserTimeOnly = (dateStr: string | Date | number, options?: Intl.DateTimeFormatOptions) => {
  if (!dateStr) return '';
  try {
    return ensureUTC(dateStr).toLocaleTimeString([], { timeZone: getUserTimezone(), ...options });
  } catch(e) { return ''; }
}

export const formatUserDateOnly = (dateStr: string | Date | number, options?: Intl.DateTimeFormatOptions) => {
  if (!dateStr) return '';
  try {
    return ensureUTC(dateStr).toLocaleDateString([], { timeZone: getUserTimezone(), ...options });
  } catch(e) { return ''; }
}

export const formatUserDateTime = (dateStr: string | Date | number, locales?: string | string[], options?: Intl.DateTimeFormatOptions) => {
  if (!dateStr) return '';
  try {
    return ensureUTC(dateStr).toLocaleString(locales || 'hi-IN', { timeZone: getUserTimezone(), ...options });
  } catch(e) { return ''; }
}
