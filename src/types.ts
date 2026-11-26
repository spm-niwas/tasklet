export type TaskletStatus = 'Active' | 'Closed' | 'Abandoned';

export type EffectiveStatus = 'Active' | 'Overdue' | 'Closed' | 'Abandoned';

export type FilterTab = 'All' | 'Overdue' | 'Active' | 'Abandoned' | 'Closed';

export type TaskletVisibility = 'supervisor' | 'private';

export type TaskletListScope = 'all' | 'supervisor' | 'mine';

export type RightPanelMode = 'tasklet' | 'supervisor';

export interface Tasklet {
  id: string;
  seq: number;
  title: string;
  deadlineISO: string;
  status: TaskletStatus;
  description: string;
  resolvedAtISO: string | null;
  createdBy: string;
  createdByEmail: string;
  createdByUid: string;
  createdAtISO: string;
  visibility: TaskletVisibility;
  supervisorEmail: string | null;
  supervisorName: string | null;
}

export interface AuthorizedUser {
  email: string;
  name: string;
  addedBy?: string;
  createdAtISO?: string;
}

export interface UserPreference {
  email: string;
  supervisorEmail: string | null;
  supervisorName: string | null;
  defaultVisibility: TaskletVisibility;
  defaultListScope?: TaskletListScope;
  updatedAtISO?: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
  isAdmin: boolean;
}

export type ToastType = 'success' | 'error' | 'closed' | 'abandoned';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'primary' | 'danger';
  onConfirm: () => void | Promise<void>;
}
