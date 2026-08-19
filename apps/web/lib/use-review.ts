'use client';

import { useCallback, useState } from 'react';
import type {
  ApiError,
  ProposeResponse,
  TransformOption,
} from '@auto-learn/shared';
import { ApiFailure, propose } from './api';

export type ReviewState =
  | { status: 'idle' }
  | { status: 'proposing' }
  | { status: 'reviewing'; response: ProposeResponse; focused: number }
  | { status: 'error'; error: ApiError };

export function useReview() {
  const [state, setState] = useState<ReviewState>({ status: 'idle' });

  const submit = useCallback(
    async (text: string, option: TransformOption) => {
      setState({ status: 'proposing' });
      try {
        const response = await propose({ text, option });
        setState({ status: 'reviewing', response, focused: 0 });
      } catch (error) {
        setState({
          status: 'error',
          error:
            error instanceof ApiFailure
              ? error.detail
              : { code: 'upstream_failed', message: 'Something went wrong.' },
        });
      }
    },
    [],
  );

  const focus = useCallback((index: number) => {
    setState((current) =>
      current.status === 'reviewing'
        ? { ...current, focused: index }
        : current,
    );
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, submit, focus, reset };
}
