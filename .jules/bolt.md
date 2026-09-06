## 2024-03-XX - [Missing useMemo for client-side filtering]
**Learning:** `components/UnifiedInbox.tsx` has expensive client-side filtering logic for conversations inside the main component render path which can run frequently when `search` or `conversations` changes.
**Action:** Use `useMemo` for `filtered` conversations array to prevent unnecessary re-renders in `components/UnifiedInbox.tsx`.
## 2024-03-XX - [Missing useMemo for client-side filtering]
**Learning:** `app/dashboard/components/ContactsView.tsx` has expensive client-side filtering logic for `filteredContacts` and `leads` inside the main component render path which can run frequently when form state changes (e.g., when the modal is open and the user types).
**Action:** Use `useMemo` for derived lists like `filteredContacts` and `leads` to prevent unnecessary re-renders in `app/dashboard/components/ContactsView.tsx`.
## 2024-03-XX - [Missing useMemo for client-side filtering]
**Learning:** `app/dashboard/components/BroadcastView.tsx` was missing the `useMemo` optimization for `filteredContacts`, which performs expensive client-side string operations (filtering, `.toLowerCase()`, `.includes()`) on potentially large arrays of contacts on every re-render.
**Action:** Always verify that derived, filtered data is memoized in components dealing with lists of contacts or conversations, specifically standardizing `useMemo` usage across all list views like `ContactsView.tsx`, `UnifiedInbox.tsx`, and `BroadcastView.tsx`.
