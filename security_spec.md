# NIWAS Tasklet Security Specification

## 1. Data Invariants
1. Admin (`director@spmniwas.in`) manages `/authorized_users` and per-user data deletion only; Admin cannot create, read (`get`), or update tasklets, and cannot be tagged as a supervisor.
2. Only authorized non-admin users in `/authorized_users/{email}` can create, view, update, close, or abandon tasklets.
3. A tasklet is readable (`get`, `list`) and editable (`update`) ONLY by its creator (`createdByEmail == email`) or its tagged supervisor (`supervisorEmail == email`).
4. A supervisor can only be an authorized user added by Admin (`exists(/authorized_users/{supervisorEmail})`), cannot be `director@spmniwas.in`, and cannot be the creator themselves.
5. Global tasklet `#seq` numbers come from `/counters/tasklet_seq` enforcing monotonic `+1` increments.
6. Per-user `/user_preferences/{email}` is strictly readable and writable only by that user.
7. Once a tasklet transitions to `'Closed'` or `'Abandoned'`, its `status`, `description`, and `resolvedAtISO` are terminally locked.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read/write to `/tasklets/tsk-1` -> Denied.
2. Unverified email (`email_verified: false`) -> Denied.
3. External Google user (not in `/authorized_users`) attempting `list` on `/authorized_users` -> Denied.
4. Non-admin user attempting to add/remove `/authorized_users` -> Denied.
5. Admin attempting `get`, `create`, or `update` on `/tasklets/tsk-1` -> Denied.
6. Non-admin user attempting to `get` or `list` another user's private tasklet -> Denied.
7. User creating tasklet tagging `director@spmniwas.in` or themselves as supervisor -> Denied.
8. User creating tasklet tagging an unapproved external email as supervisor -> Denied.
9. User attempting to read/write another user's `/user_preferences/{otherEmail}` -> Denied.
10. User attempting to decrement or jump `/counters/tasklet_seq` -> Denied.
11. Creator or supervisor updating a `'Closed'` tasklet's `description` -> Denied.
12. Non-admin user attempting to `delete` a tasklet -> Denied.
