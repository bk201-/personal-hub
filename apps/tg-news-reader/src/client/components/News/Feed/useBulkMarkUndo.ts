import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { channelKeys } from '../../../api/channels';
import type { MarkAllReadResult } from '../../../api/news';

/** Undo belongs to one view generation, not to the lifetime of the feed component. */
export function useBulkMarkUndo(channelId: number, context: string) {
  const qc = useQueryClient();
  const generation = useRef(0);
  const snapshot = useRef<number[] | null>(null);

  const reset = useCallback(() => {
    generation.current++;
    snapshot.current = null;
  }, []);

  useEffect(() => {
    reset();
    return reset;
  }, [channelId, context, reset]);

  useEffect(
    () =>
      qc.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated' || (event.action.type !== 'pending' && event.action.type !== 'success')) return;
        const key = event.mutation.options.mutationKey;
        if (key?.[0] !== channelKeys.fetch[0] || key[1] !== channelKeys.fetch[1]) return;
        const variables: unknown = event.mutation.state.variables;
        const id =
          typeof variables === 'number'
            ? variables
            : variables && typeof variables === 'object' && 'id' in variables
              ? variables.id
              : undefined;
        // Sidebar, bulk refresh and feed controls all share these mutation keys.
        if (id === channelId) reset();
      }),
    [qc, channelId, reset],
  );

  const capture = useCallback(() => {
    const requestedGeneration = generation.current;
    return (result: MarkAllReadResult) => {
      if (generation.current !== requestedGeneration) return;
      snapshot.current = result.affectedIds.length ? result.affectedIds : null;
    };
  }, []);

  const take = useCallback(() => {
    const ids = snapshot.current;
    reset();
    return ids;
  }, [reset]);

  return { reset, capture, take };
}
