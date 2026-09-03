## 2024-03-XX - [Missing useMemo for client-side filtering]
**Learning:** `components/UnifiedInbox.tsx` has expensive client-side filtering logic for conversations inside the main component render path which can run frequently when `search` or `conversations` changes.
**Action:** Use `useMemo` for `filtered` conversations array to prevent unnecessary re-renders in `components/UnifiedInbox.tsx`.

## 2024-03-XX - [Missing useMemo for client-side filtering in Dashboard Views]
**Learning:** The dashboard components like `app/dashboard/components/ContactsView.tsx` and `CallsView.tsx` have expensive client-side filtering logic (e.g., `filteredContacts`, `leads`, `filteredCalls`) that run on every render. This is an anti-pattern when rendering large datasets since it blocks the main thread during fast typing in search inputs or other state updates.
**Action:** Always wrap heavy list filtering derived from props or state with `useMemo` in dashboard list views to prevent unnecessary recalculation.
