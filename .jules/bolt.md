## 2024-03-XX - [Missing useMemo for client-side filtering]
**Learning:** `components/UnifiedInbox.tsx` has expensive client-side filtering logic for conversations inside the main component render path which can run frequently when `search` or `conversations` changes.
**Action:** Use `useMemo` for `filtered` conversations array to prevent unnecessary re-renders in `components/UnifiedInbox.tsx`.
