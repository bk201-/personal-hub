import type { Channel, Group } from '@shared/types.ts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { groupKeys, useLockAllGroups } from '../api/groups';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';

/**
 * Global "boss key" — press Esc twice within 400 ms to instantly lock all PIN groups.
 *
 * State is read via Zustand getState() and TanStack Query cache inside the event
 * handler — no refs are written or read during render, satisfying react-hooks/refs.
 *
 * Conflict with regular Esc:
 *   - No preventDefault/stopPropagation — Ant Design modals still close normally.
 *   - Handler is a no-op when unlockedGroupIds is empty, so accidental double-Esc
 *     on a normal screen does nothing.
 */
export function useBossKey() {
  const lockAll = useLockAllGroups();
  const qc = useQueryClient();
  const lastEscRef = useRef(0);

  // mutate reference may change between renders; keep a ref fresh via a no-deps effect
  // (effects run after render, not during render — safe per react-hooks/refs).
  const mutateRef = useRef(lockAll.mutate);
  useEffect(() => {
    mutateRef.current = lockAll.mutate;
  }); // intentionally no deps — must stay in sync after every render

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      // Read current auth state directly — no stale closure risk
      const { unlockedGroupIds, lockGroupsLocally } = useAuthStore.getState();
      if (unlockedGroupIds.length === 0) {
        lastEscRef.current = 0;
        return;
      }

      const now = Date.now();
      const gap = now - lastEscRef.current;
      lastEscRef.current = now;

      if (gap < 400) {
        lastEscRef.current = 0; // reset so a third Esc doesn't re-trigger

        const { selectedGroupId, selectedChannelId, setSelectedGroupId } = useUIStore.getState();

        // Read groups/channels from TanStack Query cache — always current, no stale closures
        const groups = qc.getQueryData<Group[]>(groupKeys.all) ?? [];
        const channels = qc.getQueryData<Channel[]>(['channels']) ?? [];

        const pinnedGroupIds = new Set(groups.filter((g) => g.hasPIN).map((g) => g.id));
        const currentGroupIsPinned = selectedGroupId !== null && pinnedGroupIds.has(selectedGroupId);
        const selectedCh = channels.find((c) => c.id === selectedChannelId);
        const selectedChannelInPinnedGroup =
          selectedCh?.groupId !== null && selectedCh?.groupId !== undefined && pinnedGroupIds.has(selectedCh.groupId);

        if (currentGroupIsPinned || selectedChannelInPinnedGroup) {
          // setSelectedGroupId also clears selectedChannelId + selectedNewsId (uiStore)
          setSelectedGroupId(null);
        }

        // 1. Instant optimistic UI — groups show lock icons immediately
        lockGroupsLocally();
        // 2. Persist to server + receive new token in background
        mutateRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [qc]); // qc is stable from useQueryClient — effectively runs once
}
