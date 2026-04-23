import { useCallback, useEffect, useState } from 'react';
import {
  fetchExtensions,
  clearExtensionCache,
  IpForbiddenError,
  ApiAccessDeniedError,
  type PbxExtension,
} from '@/services/linkusSdkService';

export type ExtensionsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseExtensionsOptions {
  /**
   * Only fetch when this is `true`. Usually wired to `sdk.status === 'registered'`
   * so we don't hammer the PBX before the softphone is connected.
   */
  enabled?: boolean;
}

interface UseExtensionsResult {
  status: ExtensionsStatus;
  extensions: PbxExtension[];
  error: string | null;
  /** Force a fresh fetch bypassing the 5-min cache. */
  refresh: () => void;
}

/**
 * Hook that exposes the PBX extension directory to React components.
 *
 * The underlying service caches for 5 minutes, so calling this from multiple
 * components is cheap.
 */
export function useExtensions({
  enabled = true,
}: UseExtensionsOptions = {}): UseExtensionsResult {
  const [status, setStatus] = useState<ExtensionsStatus>('idle');
  const [extensions, setExtensions] = useState<PbxExtension[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => {
    clearExtensionCache();
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);

    fetchExtensions()
      .then((list) => {
        if (cancelled) return;
        setExtensions(list);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[useExtensions] Failed to fetch extensions:', err);
        if (err instanceof IpForbiddenError) {
          setError('IP blocked by Yeastar PBX (error 70087).');
        } else if (err instanceof ApiAccessDeniedError) {
          setError(
            'No permission to list extensions. On the PBX: Integrations → API → ' +
              'edit the Open API app you use here. Enable Extension → Query Extension List. ' +
              'That is either the Linkus SDK app (VITE_YEASTAR_SDK_ACCESS_*) or, if you ' +
              'prefer a separate app, set VITE_YEASTAR_OPENAPI_ACCESS_ID and ' +
              'VITE_YEASTAR_OPENAPI_ACCESS_KEY to that separate app.'
          );
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  return { status, extensions, error, refresh };
}
