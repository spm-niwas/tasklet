import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { AddTaskletModal } from './components/AddTaskletModal';
import { AdminUsersWorkspace, type PerUserDeletionScope } from './components/AdminUsersWorkspace';
import { ConfirmModal } from './components/ConfirmModal';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { SupervisorSettingsPanel } from './components/SupervisorSettingsPanel';
import { TaskletDetailPane } from './components/TaskletDetailPane';
import { TaskletListPane } from './components/TaskletListPane';
import { ToastContainer } from './components/ToastContainer';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './lib/firebase';
import type {
  AuthorizedUser,
  ConfirmDialogConfig,
  FilterTab,
  RightPanelMode,
  Tasklet,
  TaskletListScope,
  TaskletVisibility,
  ToastItem,
  ToastType,
  UserPreference,
  UserProfile,
} from './types';
import { sendEmailNotification } from './utils/emailNotify';
import {
  capitalizeFirst,
  deriveNameFromEmail,
  getEffectiveStatus,
  getNextPreviewSeq,
  HARDCODED_ADMIN_EMAIL,
  isAdminEmail,
  isEmbeddedPreview,
  loadPreviewAuthorizedUsers,
  loadPreviewPreference,
  loadPreviewTasklets,
  savePreviewAuthorizedUsers,
  savePreviewPreference,
  savePreviewTasklets,
} from './utils/tasklet';

type PreviewRole = 'admin' | 'arjun' | 'priya';

function formatAuthErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('auth/popup-closed-by-user')) {
    return 'Google sign-in popup was closed before finishing (common inside embedded preview iframes). Open the Development App URL in a new browser tab to test real Google Sign-In, or use Design Preview.';
  }
  if (raw.includes('auth/popup-blocked')) {
    return 'Your browser blocked the Google sign-in popup. Allow popups for this site or open the app in a new tab.';
  }
  if (raw.includes('auth/unauthorized-domain')) {
    return 'This domain is not yet allowlisted in Firebase Authentication Authorized Domains.';
  }
  return raw || 'Google Sign-In failed.';
}

function isValidListScope(val: unknown): val is TaskletListScope {
  return val === 'all' || val === 'supervisor' || val === 'mine';
}

function getCachedListScope(email: string): TaskletListScope {
  if (!email) return 'all';
  try {
    const raw = localStorage.getItem(`niwas_list_scope_${email.trim().toLowerCase()}`);
    if (isValidListScope(raw)) return raw;
  } catch {
    // Ignore storage access errors
  }
  return 'all';
}

function setCachedListScope(email: string, scope: TaskletListScope): void {
  if (!email) return;
  try {
    localStorage.setItem(`niwas_list_scope_${email.trim().toLowerCase()}`, scope);
  } catch {
    // Ignore storage access errors
  }
}

function buildDefaultPreference(email: string): UserPreference {
  return {
    email,
    supervisorEmail: null,
    supervisorName: null,
    defaultVisibility: 'private',
    defaultListScope: getCachedListScope(email),
  };
}

function filterPreviewTaskletsForUser(allTasklets: Tasklet[], userEmail: string, isAdmin: boolean): Tasklet[] {
  if (isAdmin) return [];
  const normalized = userEmail.trim().toLowerCase();
  return allTasklets.filter(
    (t) =>
      t.createdByEmail?.toLowerCase() === normalized ||
      (t.visibility === 'supervisor' && t.supervisorEmail?.toLowerCase() === normalized)
  );
}

function matchesDeletionScope(tasklet: Tasklet, scope: PerUserDeletionScope, refDate?: string): boolean {
  if (scope === 'all') return true;
  if (!refDate) return false;
  const isoSource = tasklet.createdAtISO || tasklet.deadlineISO;
  const targetMs = new Date(isoSource).getTime();
  if (Number.isNaN(targetMs)) return false;

  const [year, month, day] = refDate.split('-').map(Number);
  if (!year || !month || !day) return false;

  if (scope === 'before') {
    const endOfDayMs = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
    return targetMs <= endOfDayMs;
  }
  const startOfDayMs = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  return targetMs >= startOfDayMs;
}

export default function App() {
  const embeddedPreview = useMemo(() => isEmbeddedPreview(), []);

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewRole, setPreviewRole] = useState<PreviewRole>('arjun');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [tasklets, setTasklets] = useState<Tasklet[]>([]);
  const [isLoadingTasklets, setIsLoadingTasklets] = useState(false);
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>([
    { email: HARDCODED_ADMIN_EMAIL, name: 'Director' },
  ]);
  const [userPreference, setUserPreference] = useState<UserPreference>(() =>
    buildDefaultPreference('')
  );

  const [activeFilter, setActiveFilter] = useState<FilterTab>('Active');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('tasklet');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmDialogConfig | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  const enterPreviewMode = useCallback(
    (role: PreviewRole = 'arjun', notify = false) => {
      if (!embeddedPreview) return;
      const localUsers = loadPreviewAuthorizedUsers();
      const allLocalTasks = loadPreviewTasklets();
      setAuthorizedUsers(localUsers);
      setPreviewRole(role);
      setIsPreviewMode(true);
      setLoginError(null);
      setRightPanelMode('tasklet');
      setMobileView('list');
      setSelectedId(null);

      if (role === 'admin') {
        setUser({
          uid: 'preview-admin',
          name: 'Director',
          email: HARDCODED_ADMIN_EMAIL,
          photoURL: '',
          isAdmin: true,
        });
        setTasklets([]);
        setUserPreference(buildDefaultPreference(HARDCODED_ADMIN_EMAIL));
        if (notify) showToast('Switched to Admin View (Preview).');
        return;
      }

      const nonAdmins = localUsers.filter((u) => !isAdminEmail(u.email));
      const targetMember =
        role === 'arjun'
          ? nonAdmins.find((u) => u.email === 'arjun@spmniwas.in') ?? nonAdmins[0]
          : nonAdmins.find((u) => u.email === 'priya@spmniwas.in') ?? nonAdmins[1] ?? nonAdmins[0];

      const memberEmail = targetMember?.email || (role === 'arjun' ? 'arjun@spmniwas.in' : 'priya@spmniwas.in');
      const memberName = targetMember?.name || (role === 'arjun' ? 'Arjun Sharma' : 'Priya Verma');

      setUser({
        uid: `preview-${role}`,
        name: memberName,
        email: memberEmail,
        photoURL: '',
        isAdmin: false,
      });
      setTasklets(filterPreviewTaskletsForUser(allLocalTasks, memberEmail, false));
      setUserPreference(loadPreviewPreference(memberEmail));
      if (notify) showToast(`Switched to ${memberName} (Preview).`);
    },
    [embeddedPreview, showToast]
  );

  // Re-evaluate overdue state every 30 seconds
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Firebase Auth state observer + automatic embedded preview fallback
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser || !fbUser.email) {
        if (embeddedPreview) {
          enterPreviewMode('arjun');
        } else {
          setIsPreviewMode(false);
          setUser(null);
          setTasklets([]);
          setAuthorizedUsers([{ email: HARDCODED_ADMIN_EMAIL, name: 'Director' }]);
          setUserPreference(buildDefaultPreference(''));
          setSelectedId(null);
        }
        setAuthReady(true);
        return;
      }

      const normalizedEmail = fbUser.email.trim().toLowerCase();
      const admin = isAdminEmail(normalizedEmail);

      if (!admin) {
        const userDocPath = `authorized_users/${normalizedEmail}`;
        try {
          const snap = await getDoc(doc(db, 'authorized_users', normalizedEmail));
          if (!snap.exists()) {
            setLoginError(
              `Access denied for ${normalizedEmail}. Only accounts added by ${HARDCODED_ADMIN_EMAIL} can sign in.`
            );
            await signOut(auth);
            setIsPreviewMode(false);
            setUser(null);
            setAuthReady(true);
            return;
          }
          const data = snap.data() as Partial<AuthorizedUser> | undefined;
          const resolvedName =
            fbUser.displayName?.trim() ||
            (data?.name ? capitalizeFirst(String(data.name).trim()) : deriveNameFromEmail(normalizedEmail));
          setLoginError(null);
          setIsPreviewMode(false);
          setUser({
            uid: fbUser.uid,
            email: normalizedEmail,
            name: resolvedName,
            photoURL: fbUser.photoURL ?? '',
            isAdmin: false,
          });
          setUserPreference(buildDefaultPreference(normalizedEmail));
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, userDocPath);
        }
      } else {
        setLoginError(null);
        setIsPreviewMode(false);
        setUser({
          uid: fbUser.uid,
          email: normalizedEmail,
          name: fbUser.displayName?.trim() || 'Director',
          photoURL: fbUser.photoURL ?? '',
          isAdmin: true,
        });
        setTasklets([]);
        setUserPreference(buildDefaultPreference(normalizedEmail));
      }

      setAuthReady(true);
    });

    return () => unsubscribe();
  }, [embeddedPreview, enterPreviewMode]);

  // Real-time Firestore listeners for tasklets (NON-ADMIN ONLY: own + supervised)
  useEffect(() => {
    if (!authReady || !user || user.isAdmin || isPreviewMode) {
      if (user?.isAdmin) setTasklets([]);
      setIsLoadingTasklets(false);
      return;
    }

    setIsLoadingTasklets(true);
    const ownedMap = new Map<string, Tasklet>();
    const supervisedMap = new Map<string, Tasklet>();
    let ownedReady = false;
    let supervisedReady = false;

    const syncMerged = () => {
      const merged = new Map<string, Tasklet>();
      ownedMap.forEach((value, key) => merged.set(key, value));
      supervisedMap.forEach((value, key) => merged.set(key, value));
      setTasklets(Array.from(merged.values()));
      if (ownedReady && supervisedReady) {
        setIsLoadingTasklets(false);
      }
    };

    const ownedQuery = query(collection(db, 'tasklets'), where('createdByEmail', '==', user.email));
    const supervisedQuery = query(collection(db, 'tasklets'), where('supervisorEmail', '==', user.email));

    const unsubOwned = onSnapshot(
      ownedQuery,
      (snapshot) => {
        ownedMap.clear();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Omit<Tasklet, 'id'>;
          ownedMap.set(docSnap.id, { id: docSnap.id, ...data });
        });
        ownedReady = true;
        syncMerged();
      },
      (error) => {
        setIsLoadingTasklets(false);
        handleFirestoreError(error, OperationType.LIST, 'tasklets');
      }
    );

    const unsubSupervised = onSnapshot(
      supervisedQuery,
      (snapshot) => {
        supervisedMap.clear();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Omit<Tasklet, 'id'>;
          supervisedMap.set(docSnap.id, { id: docSnap.id, ...data });
        });
        supervisedReady = true;
        syncMerged();
      },
      (error) => {
        setIsLoadingTasklets(false);
        handleFirestoreError(error, OperationType.LIST, 'tasklets');
      }
    );

    return () => {
      unsubOwned();
      unsubSupervised();
    };
  }, [authReady, user, isPreviewMode]);

  // Real-time Firestore listener for authorized_users (Admin + Authorized members for supervisor selection)
  useEffect(() => {
    if (!authReady || !user || isPreviewMode) return;

    const unsubscribe = onSnapshot(
      collection(db, 'authorized_users'),
      (snapshot) => {
        const map = new Map<string, AuthorizedUser>();
        map.set(HARDCODED_ADMIN_EMAIL, {
          email: HARDCODED_ADMIN_EMAIL,
          name: 'Director',
        });
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Partial<AuthorizedUser>;
          const email = (data.email || docSnap.id || '').trim().toLowerCase();
          if (email) {
            map.set(email, {
              email,
              name: capitalizeFirst(String(data.name || deriveNameFromEmail(email)).trim()),
              addedBy: data.addedBy,
              createdAtISO: data.createdAtISO,
            });
          }
        });
        setAuthorizedUsers(Array.from(map.values()));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'authorized_users');
      }
    );

    return () => unsubscribe();
  }, [authReady, user, isPreviewMode]);

  // Real-time Firestore listener for current non-admin user's supervisor & visibility preferences
  useEffect(() => {
    if (!authReady || !user || user.isAdmin || isPreviewMode) return;

    const prefPath = `user_preferences/${user.email}`;
    const unsubscribe = onSnapshot(
      doc(db, 'user_preferences', user.email),
      (docSnap) => {
        if (!docSnap.exists()) {
          setUserPreference(buildDefaultPreference(user.email));
          return;
        }
        const data = docSnap.data() as Partial<UserPreference>;
        const resolvedScope: TaskletListScope = isValidListScope(data.defaultListScope)
          ? data.defaultListScope
          : getCachedListScope(user.email);
        setCachedListScope(user.email, resolvedScope);
        setUserPreference({
          email: user.email,
          supervisorEmail: data.supervisorEmail ? String(data.supervisorEmail).trim().toLowerCase() : null,
          supervisorName: data.supervisorName ? String(data.supervisorName).trim() : null,
          defaultVisibility: data.defaultVisibility === 'supervisor' ? 'supervisor' : 'private',
          defaultListScope: resolvedScope,
          updatedAtISO: data.updatedAtISO,
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, prefPath);
      }
    );

    return () => unsubscribe();
  }, [authReady, user, isPreviewMode]);

  // Eligible supervisors: Admin-added users excluding Admin and self
  const eligibleSupervisors = useMemo(() => {
    if (!user || user.isAdmin) return [];
    const selfEmail = user.email.toLowerCase();
    return authorizedUsers
      .filter((u) => !isAdminEmail(u.email) && u.email.toLowerCase() !== selfEmail)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [authorizedUsers, user]);

  // Keep userPreference valid if an Admin removes the tagged supervisor
  const effectiveUserPreference = useMemo<UserPreference>(() => {
    if (!user) return buildDefaultPreference('');
    if (
      userPreference.supervisorEmail &&
      !eligibleSupervisors.some((s) => s.email === userPreference.supervisorEmail)
    ) {
      return {
        ...userPreference,
        supervisorEmail: null,
        supervisorName: null,
        defaultVisibility: 'private',
      };
    }
    return userPreference;
  }, [user, userPreference, eligibleSupervisors]);

  const listScope: TaskletListScope = isValidListScope(effectiveUserPreference.defaultListScope)
    ? effectiveUserPreference.defaultListScope
    : 'all';

  const isFirstTasklet = useMemo(() => {
    if (!user || user.isAdmin) return false;
    const selfEmail = user.email.toLowerCase();
    return !tasklets.some((t) => t.createdByEmail?.toLowerCase() === selfEmail);
  }, [tasklets, user]);

  // Scope tasklets by the active ownership radio (Show all / Show supervisor / Show mine)
  const scopedTasklets = useMemo(() => {
    if (!user || user.isAdmin) return [];
    const selfEmail = user.email.toLowerCase();
    if (listScope === 'mine') {
      return tasklets.filter((t) => t.createdByEmail?.toLowerCase() === selfEmail);
    }
    if (listScope === 'supervisor') {
      return tasklets.filter(
        (t) =>
          t.visibility === 'supervisor' &&
          t.supervisorEmail?.toLowerCase() === selfEmail &&
          t.createdByEmail?.toLowerCase() !== selfEmail
      );
    }
    return tasklets;
  }, [tasklets, user, listScope]);

  // Computed status counts strictly within the active ownership scope
  const statusCounts = useMemo<Record<FilterTab, number>>(() => {
    const counts: Record<FilterTab, number> = {
      All: scopedTasklets.length,
      Overdue: 0,
      Active: 0,
      Abandoned: 0,
      Closed: 0,
    };
    scopedTasklets.forEach((t) => {
      const eff = getEffectiveStatus(t, nowMs);
      counts[eff]++;
    });
    return counts;
  }, [scopedTasklets, nowMs]);

  // Filtered & sorted tasklets strictly within the active ownership scope
  const filteredTasklets = useMemo(() => {
    const tokens = searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return scopedTasklets
      .filter((t) => {
        const eff = getEffectiveStatus(t, nowMs);
        if (activeFilter !== 'All' && eff !== activeFilter) {
          return false;
        }
        if (tokens.length > 0) {
          const searchable = [
            `#${t.seq}`,
            String(t.seq),
            t.title || '',
            t.description || '',
            t.createdBy || '',
            t.supervisorName || '',
          ]
            .join(' ')
            .toLowerCase();
          return tokens.every((token) => searchable.includes(token));
        }
        return true;
      })
      .sort((a, b) => b.seq - a.seq);
  }, [scopedTasklets, activeFilter, searchQuery, nowMs]);

  // Ensure a valid initial selection when scoped tasklets arrive
  useEffect(() => {
    if (!user || user.isAdmin) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (scopedTasklets.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !scopedTasklets.some((t) => t.id === selectedId)) {
      const fallback = filteredTasklets[0] ?? [...scopedTasklets].sort((a, b) => b.seq - a.seq)[0];
      if (fallback) setSelectedId(fallback.id);
    }
  }, [user, scopedTasklets, filteredTasklets, selectedId]);

  const selectedTasklet = useMemo(
    () => scopedTasklets.find((t) => t.id === selectedId) ?? null,
    [scopedTasklets, selectedId]
  );

  // Handlers
  const handleGoogleSignIn = async () => {
    setLoginError(null);
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Signed in with Google.');
    } catch (err) {
      const friendly = formatAuthErrorMessage(err);
      setLoginError(friendly);
      showToast(friendly, 'error');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
      setIsPreviewMode(false);
      setUser(null);
      setRightPanelMode('tasklet');
      setMobileView('list');
      showToast('Logged out of NIWAS Tasklet.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to log out.';
      showToast(message, 'error');
    }
  };

  const handleSelectListScope = async (nextScope: TaskletListScope) => {
    if (!user || user.isAdmin) return;
    setCurrentPage(1);
    setMobileView('list');
    setCachedListScope(user.email, nextScope);

    const scopeToast =
      nextScope === 'all'
        ? 'Showing all tasklets.'
        : nextScope === 'supervisor'
        ? 'Showing Supervisor tasklets.'
        : 'Showing only your tasklets.';

    const nextPref: UserPreference = {
      email: user.email,
      supervisorEmail: effectiveUserPreference.supervisorEmail ?? null,
      supervisorName: effectiveUserPreference.supervisorName ?? null,
      defaultVisibility: effectiveUserPreference.supervisorEmail
        ? effectiveUserPreference.defaultVisibility
        : 'private',
      defaultListScope: nextScope,
      updatedAtISO: new Date().toISOString(),
    };

    setUserPreference(nextPref);
    showToast(scopeToast);

    if (isPreviewMode) {
      savePreviewPreference(nextPref);
      return;
    }

    const prefPath = `user_preferences/${user.email}`;
    try {
      await setDoc(doc(db, 'user_preferences', user.email), nextPref);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, prefPath);
    }
  };

  const handleSavePreference = async ({
    supervisorEmail,
    supervisorName,
    defaultVisibility,
  }: {
    supervisorEmail: string | null;
    supervisorName: string | null;
    defaultVisibility: TaskletVisibility;
  }) => {
    if (!user || user.isAdmin) return;
    const prevSupEmail = effectiveUserPreference.supervisorEmail ?? null;
    const prevSupName = effectiveUserPreference.supervisorName ?? null;
    const nextPref: UserPreference = {
      email: user.email,
      supervisorEmail,
      supervisorName,
      defaultVisibility: supervisorEmail ? defaultVisibility : 'private',
      defaultListScope: listScope,
      updatedAtISO: new Date().toISOString(),
    };

    const suffix = isPreviewMode ? ' (Preview).' : '.';
    const toastMsg = !supervisorEmail && prevSupEmail
      ? `Supervisor cleared${suffix}`
      : supervisorEmail && !prevSupEmail
      ? `Supervisor set to ${supervisorName}${suffix}`
      : supervisorEmail && supervisorEmail !== prevSupEmail
      ? `Supervisor changed to ${supervisorName}${suffix}`
      : `Supervisor preferences saved${suffix}`;

    if (isPreviewMode) {
      savePreviewPreference(nextPref);
      setUserPreference(nextPref);
      showToast(toastMsg);
      return;
    }

    const prefPath = `user_preferences/${user.email}`;
    try {
      await setDoc(doc(db, 'user_preferences', user.email), nextPref);
      setUserPreference(nextPref);
      showToast(toastMsg);

      if (supervisorEmail && !prevSupEmail) {
        void sendEmailNotification({
          event: 'supervisor_assigned',
          actorName: user.name,
          supervisorEmail,
          supervisorName: supervisorName ?? undefined,
        }).then((res) => {
          if (res.delivered) showToast(`Notification email sent to ${supervisorName || supervisorEmail}.`);
        });
      } else if (supervisorEmail && prevSupEmail && supervisorEmail !== prevSupEmail) {
        void sendEmailNotification({
          event: 'supervisor_changed',
          actorName: user.name,
          supervisorEmail,
          supervisorName: supervisorName ?? undefined,
          previousSupervisorEmail: prevSupEmail,
          previousSupervisorName: prevSupName ?? undefined,
        }).then((res) => {
          if (res.delivered) showToast('Supervisor change notification emails sent.');
        });
      } else if (!supervisorEmail && prevSupEmail) {
        void sendEmailNotification({
          event: 'supervisor_removed',
          actorName: user.name,
          previousSupervisorEmail: prevSupEmail,
          previousSupervisorName: prevSupName ?? undefined,
        }).then((res) => {
          if (res.delivered) showToast(`Notification email sent to ${prevSupName || prevSupEmail}.`);
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, prefPath);
    }
  };

  const handleCreateTasklet = async ({
    title,
    deadlineISO,
    visibility,
    supervisorEmail,
    supervisorName,
  }: {
    title: string;
    deadlineISO: string;
    visibility: TaskletVisibility;
    supervisorEmail: string | null;
    supervisorName: string | null;
  }) => {
    if (!user || user.isAdmin) return;

    const nowISO = new Date().toISOString();
    const id = `tsk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const taskletSupervisorEmail = visibility === 'supervisor' ? supervisorEmail : null;
    const taskletSupervisorName = visibility === 'supervisor' ? supervisorName : null;

    const nextPreference: UserPreference = {
      email: user.email,
      supervisorEmail,
      supervisorName,
      defaultVisibility: visibility,
      defaultListScope: listScope,
      updatedAtISO: nowISO,
    };

    if (isPreviewMode) {
      const allPreview = loadPreviewTasklets();
      const nextSeq = getNextPreviewSeq(allPreview);
      const newTasklet: Tasklet = {
        id,
        seq: nextSeq,
        title,
        deadlineISO,
        status: 'Active',
        description: '',
        resolvedAtISO: null,
        createdBy: user.name || deriveNameFromEmail(user.email),
        createdByEmail: user.email,
        createdByUid: user.uid,
        createdAtISO: nowISO,
        visibility,
        supervisorEmail: taskletSupervisorEmail,
        supervisorName: taskletSupervisorName,
      };
      const updatedAll = [newTasklet, ...allPreview];
      savePreviewTasklets(updatedAll);
      savePreviewPreference(nextPreference);
      setUserPreference(nextPreference);
      setTasklets(filterPreviewTaskletsForUser(updatedAll, user.email, false));
      setActiveFilter('Active');
      setCurrentPage(1);
      setSelectedId(id);
      setRightPanelMode('tasklet');
      setMobileView('list');
      showToast(`Tasklet #${nextSeq} created (Preview).`);
      return;
    }

    const docPath = `tasklets/${id}`;
    try {
      const counterRef = doc(db, 'counters', 'tasklet_seq');
      const taskletRef = doc(db, 'tasklets', id);
      const prefRef = doc(db, 'user_preferences', user.email);

      const createdSeq = await runTransaction(db, async (tx) => {
        const counterSnap = await tx.get(counterRef);
        const nextSeq = counterSnap.exists()
          ? Number((counterSnap.data() as { lastSeq?: number }).lastSeq || 0) + 1
          : 1;

        const newTasklet: Tasklet = {
          id,
          seq: nextSeq,
          title,
          deadlineISO,
          status: 'Active',
          description: '',
          resolvedAtISO: null,
          createdBy: user.name || deriveNameFromEmail(user.email),
          createdByEmail: user.email,
          createdByUid: user.uid,
          createdAtISO: nowISO,
          visibility,
          supervisorEmail: taskletSupervisorEmail,
          supervisorName: taskletSupervisorName,
        };

        if (counterSnap.exists()) {
          tx.update(counterRef, { lastSeq: nextSeq });
        } else {
          tx.set(counterRef, { lastSeq: 1 });
        }
        tx.set(taskletRef, newTasklet);
        tx.set(prefRef, nextPreference);
        return nextSeq;
      });

      const prevSupEmail = effectiveUserPreference.supervisorEmail ?? null;
      const prevSupName = effectiveUserPreference.supervisorName ?? null;

      setUserPreference(nextPreference);
      setActiveFilter('Active');
      setCurrentPage(1);
      setSelectedId(id);
      setRightPanelMode('tasklet');
      setMobileView('list');
      showToast(`Tasklet #${createdSeq} created.`);

      if (supervisorEmail && supervisorEmail !== prevSupEmail) {
        void sendEmailNotification({
          event: prevSupEmail ? 'supervisor_changed' : 'supervisor_assigned',
          actorName: user.name,
          supervisorEmail,
          supervisorName: supervisorName ?? undefined,
          previousSupervisorEmail: prevSupEmail ?? undefined,
          previousSupervisorName: prevSupName ?? undefined,
        });
      }

      if (visibility === 'supervisor' && supervisorEmail) {
        void sendEmailNotification({
          event: 'tasklet_created_supervisor',
          actorName: user.name,
          supervisorEmail,
          supervisorName: supervisorName ?? undefined,
          taskletSeq: createdSeq,
          taskletTitle: title,
          taskletDeadlineISO: deadlineISO,
        }).then((res) => {
          if (res.delivered) {
            showToast(`Email sent to Supervisor ${supervisorName || supervisorEmail}.`);
          }
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, docPath);
    }
  };

  const handleSaveDescription = useCallback(
    async (tasklet: Tasklet, description: string, silent = false) => {
      if (!user || user.isAdmin) return;

      if (isPreviewMode) {
        const allPreview = loadPreviewTasklets();
        const updatedAll = allPreview.map((t) => (t.id === tasklet.id ? { ...t, description } : t));
        savePreviewTasklets(updatedAll);
        setTasklets(filterPreviewTaskletsForUser(updatedAll, user.email, false));
        if (!silent) {
          showToast(`Description saved for #${tasklet.seq} (Preview).`);
        }
        return;
      }

      const docPath = `tasklets/${tasklet.id}`;
      try {
        await updateDoc(doc(db, 'tasklets', tasklet.id), { description });
        if (!silent) {
          showToast(`Description saved for #${tasklet.seq}.`);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
    },
    [isPreviewMode, showToast, user]
  );

  const handleResolveTasklet = (
    tasklet: Tasklet,
    targetStatus: 'Closed' | 'Abandoned',
    description: string
  ) => {
    if (!user || user.isAdmin) return;
    const isAbandon = targetStatus === 'Abandoned';
    setConfirmConfig({
      title: isAbandon ? 'Mark Tasklet as Abandoned?' : 'Close Tasklet?',
      message: isAbandon
        ? `Are you sure you want to mark "#${tasklet.seq} ${tasklet.title}" as Abandoned? This action locks the description.`
        : `Are you sure you want to close "#${tasklet.seq} ${tasklet.title}"? This action locks the description.`,
      confirmLabel: isAbandon ? 'Yes, Abandon' : 'Yes, Close',
      variant: isAbandon ? 'danger' : 'primary',
      onConfirm: async () => {
        const resolvedAtISO = new Date().toISOString();

        if (isPreviewMode) {
          const allPreview = loadPreviewTasklets();
          const updatedAll = allPreview.map((t) =>
            t.id === tasklet.id ? { ...t, description, status: targetStatus, resolvedAtISO } : t
          );
          savePreviewTasklets(updatedAll);
          setTasklets(filterPreviewTaskletsForUser(updatedAll, user.email, false));
          setMobileView('list');
          showToast(
            isAbandon ? `Tasklet #${tasklet.seq} abandoned.` : `Tasklet #${tasklet.seq} closed.`,
            isAbandon ? 'abandoned' : 'closed'
          );
          return;
        }

        const docPath = `tasklets/${tasklet.id}`;
        try {
          await updateDoc(doc(db, 'tasklets', tasklet.id), {
            description,
            status: targetStatus,
            resolvedAtISO,
          });
          setMobileView('list');
          showToast(
            isAbandon ? `Tasklet #${tasklet.seq} abandoned.` : `Tasklet #${tasklet.seq} closed.`,
            isAbandon ? 'abandoned' : 'closed'
          );

          if (tasklet.visibility === 'supervisor' && tasklet.supervisorEmail) {
            const actorIsCreator = tasklet.createdByEmail?.toLowerCase() === user.email.toLowerCase();
            const recipientEmail = actorIsCreator ? tasklet.supervisorEmail : tasklet.createdByEmail;
            const recipientName = actorIsCreator ? tasklet.supervisorName : tasklet.createdBy;
            if (recipientEmail && recipientEmail.toLowerCase() !== user.email.toLowerCase()) {
              void sendEmailNotification({
                event: targetStatus === 'Closed' ? 'tasklet_closed' : 'tasklet_abandoned',
                actorName: user.name,
                recipientEmail,
                recipientName: recipientName ?? undefined,
                taskletSeq: tasklet.seq,
                taskletTitle: tasklet.title,
                taskletDeadlineISO: tasklet.deadlineISO,
                taskletDescription: description,
                resolvedAtISO,
              }).then((res) => {
                if (res.delivered) showToast(`Resolution email sent to ${recipientName || recipientEmail}.`);
              });
            }
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, docPath);
        }
      },
    });
  };

  const handleAddAuthorizedUser = async ({ name, email }: { name: string; email: string }): Promise<boolean> => {
    if (!user?.isAdmin) return false;
    const payload: AuthorizedUser = {
      name,
      email,
      addedBy: user.email,
      createdAtISO: new Date().toISOString(),
    };

    if (isPreviewMode) {
      const updated = [...authorizedUsers, payload];
      setAuthorizedUsers(updated);
      savePreviewAuthorizedUsers(updated);
      showToast(`User "${name}" (${email}) added (Preview).`);
      return true;
    }

    const docPath = `authorized_users/${email}`;
    try {
      await setDoc(doc(db, 'authorized_users', email), payload);
      showToast(`User "${name}" (${email}) added successfully.`);
      void sendEmailNotification({
        event: 'user_added',
        actorName: user.name,
        targetName: name,
        targetEmail: email,
      }).then((res) => {
        if (res.delivered) showToast(`Welcome email sent to ${email}.`);
      });
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, docPath);
    }
  };

  const handleRemoveAuthorizedUser = (targetUser: AuthorizedUser) => {
    if (!user?.isAdmin || isAdminEmail(targetUser.email)) return;

    setConfirmConfig({
      title: 'Remove Authorized User?',
      message: `Remove ${targetUser.name} (${targetUser.email}) from NIWAS Tasklet? They will no longer be able to sign in or act as a Supervisor.`,
      confirmLabel: 'Remove User',
      variant: 'danger',
      onConfirm: async () => {
        if (isPreviewMode) {
          const updated = authorizedUsers.filter((u) => u.email !== targetUser.email);
          setAuthorizedUsers(updated);
          savePreviewAuthorizedUsers(updated);
          showToast(`Removed ${targetUser.email} from authorized users (Preview).`);
          return;
        }

        const docPath = `authorized_users/${targetUser.email}`;
        try {
          await deleteDoc(doc(db, 'authorized_users', targetUser.email));
          try {
            await deleteDoc(doc(db, 'user_preferences', targetUser.email));
          } catch {
            // Preference document may not exist
          }
          showToast(`Removed ${targetUser.email} from authorized users.`);
          void sendEmailNotification({
            event: 'user_removed',
            actorName: user.name,
            targetName: targetUser.name,
            targetEmail: targetUser.email,
          }).then((res) => {
            if (res.delivered) showToast(`Removal notice sent to ${targetUser.email}.`);
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, docPath);
        }
      },
    });
  };

  const handleClearUserData = async (
    targetUser: AuthorizedUser,
    scope: PerUserDeletionScope,
    refDate?: string
  ) => {
    if (!user?.isAdmin || isAdminEmail(targetUser.email)) return;

    const scopeText =
      scope === 'all'
        ? `ALL tasklet data created by ${targetUser.name}`
        : scope === 'before'
        ? `tasklet data created by ${targetUser.name} on or before ${refDate}`
        : `tasklet data created by ${targetUser.name} from ${refDate} onwards`;

    const emailScopeLabel =
      scope === 'all'
        ? 'ALL tasklet data'
        : scope === 'before'
        ? `tasklet data on or before ${refDate}`
        : `tasklet data from ${refDate} onwards`;

    if (isPreviewMode) {
      const allPreview = loadPreviewTasklets();
      const matchingIds = new Set(
        allPreview
          .filter(
            (t) =>
              t.createdByEmail?.toLowerCase() === targetUser.email.toLowerCase() &&
              matchesDeletionScope(t, scope, refDate)
          )
          .map((t) => t.id)
      );

      if (matchingIds.size === 0) {
        showToast(`No matching tasklet data found for ${targetUser.name}.`, 'error');
        return;
      }

      setConfirmConfig({
        title: 'Confirm Clear User Data',
        message: `Permanently delete ${scopeText} (${targetUser.email})? This action cannot be undone.`,
        confirmLabel: 'Permanently Delete',
        variant: 'danger',
        onConfirm: async () => {
          const latest = loadPreviewTasklets();
          const remaining = latest.filter((t) => !matchingIds.has(t.id));
          savePreviewTasklets(remaining);
          showToast(`Cleared selected tasklet data for ${targetUser.name} (Preview).`);
        },
      });
      return;
    }

    try {
      const q = query(collection(db, 'tasklets'), where('createdByEmail', '==', targetUser.email));
      const snapshot = await getDocs(q);
      const matchingIds: string[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Tasklet;
        if (matchesDeletionScope({ ...data, id: docSnap.id }, scope, refDate)) {
          matchingIds.push(docSnap.id);
        }
      });

      if (matchingIds.length === 0) {
        showToast(`No matching tasklet data found for ${targetUser.name}.`, 'error');
        return;
      }

      setConfirmConfig({
        title: 'Confirm Clear User Data',
        message: `Permanently delete ${scopeText} (${targetUser.email})? This action cannot be undone.`,
        confirmLabel: 'Permanently Delete',
        variant: 'danger',
        onConfirm: async () => {
          try {
            await Promise.all(matchingIds.map((id) => deleteDoc(doc(db, 'tasklets', id))));
            showToast(`Cleared selected tasklet data for ${targetUser.name}.`);
            void sendEmailNotification({
              event: 'user_data_cleared',
              actorName: user.name,
              targetName: targetUser.name,
              targetEmail: targetUser.email,
              scopeDescription: emailScopeLabel,
            }).then((res) => {
              if (res.delivered) showToast(`Data-clear notice sent to ${targetUser.email}.`);
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, 'tasklets');
          }
        },
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'tasklets');
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-sm font-medium text-slate-500">Loading NIWAS Tasklet...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginScreen
          onGoogleSignIn={() => void handleGoogleSignIn()}
          isSigningIn={isSigningIn}
          errorMessage={loginError}
          canEnterPreview={embeddedPreview}
          onEnterPreview={() => enterPreviewMode('arjun', true)}
        />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header
        user={user}
        userPreference={user.isAdmin ? null : effectiveUserPreference}
        isPreviewMode={isPreviewMode && embeddedPreview}
        onOpenAddModal={() => {
          if (!user.isAdmin) setIsAddModalOpen(true);
        }}
        onOpenAddUserModal={() => {
          if (user.isAdmin) setIsAddUserModalOpen(true);
        }}
        onOpenSupervisorSettings={() => {
          if (user.isAdmin) return;
          const openPanel = () => {
            setRightPanelMode('supervisor');
            setMobileView('detail');
            showToast('Opened Supervisor Settings.');
          };

          if (effectiveUserPreference.supervisorEmail) {
            setConfirmConfig({
              title: 'Change Supervisor?',
              message: `Your current Supervisor is ${
                effectiveUserPreference.supervisorName || effectiveUserPreference.supervisorEmail
              }. Do you want to update or remove your Supervisor?`,
              confirmLabel: 'Yes, Change',
              variant: 'primary',
              onConfirm: openPanel,
            });
          } else {
            openPanel();
          }
        }}
        onLogout={() => void handleLogout()}
      />

      {user.isAdmin ? (
        <AdminUsersWorkspace
          authorizedUsers={authorizedUsers}
          isAddUserModalOpen={isAddUserModalOpen}
          onCloseAddUserModal={() => setIsAddUserModalOpen(false)}
          onAddUser={handleAddAuthorizedUser}
          onRemoveUser={handleRemoveAuthorizedUser}
          onClearUserData={handleClearUserData}
          onNotify={showToast}
        />
      ) : (
        <main className="flex-1 w-full px-3 sm:px-6 py-3 sm:py-4 flex flex-col">
          <div className="flex-1 flex flex-col lg:flex-row gap-4 sm:gap-5 items-stretch">
            <TaskletListPane
              tasklets={filteredTasklets}
              currentUserEmail={user.email}
              listScope={listScope}
              activeFilter={activeFilter}
              searchQuery={searchQuery}
              currentPage={currentPage}
              selectedId={selectedId}
              statusCounts={statusCounts}
              nowMs={nowMs}
              isLoading={isLoadingTasklets}
              isVisibleOnMobile={mobileView === 'list'}
              onSelectListScope={(scope) => void handleSelectListScope(scope)}
              onSearchChange={(val) => {
                setSearchQuery(val);
                setCurrentPage(1);
              }}
              onSelectFilter={(filter) => {
                setActiveFilter(filter);
                setCurrentPage(1);
                setMobileView('list');
                showToast(`Showing ${filter} tasklets (${statusCounts[filter]}).`);
              }}
              onSelectTasklet={(id) => {
                setSelectedId(id);
                setRightPanelMode('tasklet');
                setMobileView('detail');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onPageChange={setCurrentPage}
              onOpenAddModal={() => setIsAddModalOpen(true)}
            />

            <section
              className={`${
                mobileView === 'detail' ? 'flex' : 'hidden lg:flex'
              } w-full lg:w-[55%] bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-7 min-h-[420px] sm:min-h-[460px] flex-col`}
            >
              {rightPanelMode === 'supervisor' ? (
                <SupervisorSettingsPanel
                  currentUserEmail={user.email}
                  eligibleSupervisors={eligibleSupervisors}
                  userPreference={effectiveUserPreference}
                  onSavePreference={handleSavePreference}
                  onClose={() => setRightPanelMode('tasklet')}
                  onBackToList={() => {
                    setRightPanelMode('tasklet');
                    setMobileView('list');
                  }}
                />
              ) : (
                <TaskletDetailPane
                  tasklet={selectedTasklet}
                  currentUserEmail={user.email}
                  activeFilter={activeFilter}
                  nowMs={nowMs}
                  onBackToList={() => setMobileView('list')}
                  onSaveDescription={handleSaveDescription}
                  onResolveTasklet={handleResolveTasklet}
                  onNotify={showToast}
                />
              )}
            </section>
          </div>
        </main>
      )}

      {/* Design Preview Role Switcher (strictly hidden in production/standalone; only shown inside embedded AI Studio preview) */}
      {isPreviewMode && embeddedPreview && (
        <div className="fixed bottom-4 left-4 z-40 flex items-center gap-1 p-1.5 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-xl">
          <button
            type="button"
            onClick={() => enterPreviewMode('admin', true)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              previewRole === 'admin'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => enterPreviewMode('arjun', true)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              previewRole === 'arjun'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Arjun
          </button>
          <button
            type="button"
            onClick={() => enterPreviewMode('priya', true)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              previewRole === 'priya'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Priya
          </button>
        </div>
      )}

      {!user.isAdmin && (
        <AddTaskletModal
          isOpen={isAddModalOpen}
          eligibleSupervisors={eligibleSupervisors}
          userPreference={effectiveUserPreference}
          isFirstTasklet={isFirstTasklet}
          onClose={() => setIsAddModalOpen(false)}
          onRequestConfirmChangeSupervisor={(currentSupervisorName, onConfirmed) => {
            setConfirmConfig({
              title: 'Change Supervisor?',
              message: `Your current Supervisor is ${currentSupervisorName}. Do you want to choose a different Supervisor?`,
              confirmLabel: 'Yes, Change',
              variant: 'primary',
              onConfirm: onConfirmed,
            });
          }}
          onNotify={showToast}
          onCreateTasklet={handleCreateTasklet}
        />
      )}

      <ConfirmModal config={confirmConfig} onCancel={() => setConfirmConfig(null)} />

      <ToastContainer toasts={toasts} />
    </div>
  );
}
