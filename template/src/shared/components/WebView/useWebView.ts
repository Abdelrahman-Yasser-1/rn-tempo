import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { WebView, WebViewNavigation } from 'react-native-webview';
import type {
  ShouldStartLoadRequest,
  WebViewProgressEvent,
} from 'react-native-webview/lib/WebViewTypes';

import { openUrlSafe } from '@services/linking/linking';

import type { WebViewProps } from './types';

export type NavigationDecision = 'allow' | 'external' | 'block';

const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:', 'sms:']);
// A backslash ends the authority like `/` does: browsers read `https://evil.com\@good.com` as evil.com.
const URL_PARTS = /^([a-z][a-z0-9+.-]*:)(?:\/\/([^/\\?#]*))?/i;

/** The scheme (`https:`) and host of a URL, lower-cased; `null` when it does not parse. */
export function parseUrl(url: string): { protocol: string; host: string } | null {
  const match = URL_PARTS.exec(url.trim());
  if (match?.[1] === undefined) {
    return null;
  }
  const authority = match[2] ?? '';
  // Drop `user:pass@` and the port, so `https://good.com@evil.com:8443/` reads as `evil.com`.
  const host = (authority.split('@').pop() ?? '').replace(/:\d*$/, '').toLowerCase();
  return { protocol: match[1].toLowerCase(), host };
}

/** Whether a URL is an absolute `https` address, the only kind the web view loads itself. */
export function isHttpsUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed?.protocol === 'https:' && parsed.host !== '';
}

/** Whether `host` is one of `allowedHosts` or a subdomain of one. */
export function isHostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  return allowedHosts.some((allowed) => {
    const base = allowed.toLowerCase();
    return host === base || host.endsWith(`.${base}`);
  });
}

/**
 * Decides what to do with a navigation request: load it in the view (`allow`), hand it to the
 * system (`external`), or drop it (`block`). Top-frame pages load only over `https` on an allowed
 * host; other web links, mail, phone and SMS links open outside the app; any other scheme
 * (`javascript:`, `intent:`, `file:`...) is dropped. Frames inside a page may load any web content.
 */
export function decideNavigation(
  url: string,
  allowedHosts: readonly string[],
  isTopFrame = true,
): NavigationDecision {
  const parsed = parseUrl(url);
  if (parsed === null) {
    return 'block';
  }
  const { protocol, host } = parsed;
  if (protocol === 'about:') {
    return url.trim().toLowerCase() === 'about:blank' ? 'allow' : 'block';
  }
  if (!isTopFrame) {
    return protocol === 'https:' || protocol === 'http:' ? 'allow' : 'block';
  }
  if (protocol === 'https:' && isHostAllowed(host, allowedHosts)) {
    return 'allow';
  }
  return EXTERNAL_SCHEMES.has(protocol) ? 'external' : 'block';
}

/**
 * Logic of the web view: load progress, the error state with retry, reloading on a new
 * `reloadToken`, and the navigation policy (see `decideNavigation`).
 */
export function useWebView({
  url,
  allowedHosts,
  reloadToken = 0,
  onPageChange,
  webViewRef,
}: Pick<WebViewProps, 'url' | 'allowedHosts' | 'reloadToken' | 'onPageChange'> & {
  webViewRef: RefObject<WebView<object> | null>;
}) {
  const [progress, setProgress] = useState(0);
  const [hasError, setHasError] = useState(false);
  const isFirstTokenRef = useRef(true);
  const hosts = allowedHosts ?? [parseUrl(url)?.host ?? ''];

  const reload = () => {
    setHasError(false);
    setProgress(0);
    webViewRef.current?.reload();
  };

  useEffect(() => {
    if (isFirstTokenRef.current) {
      isFirstTokenRef.current = false;
      return;
    }
    setHasError(false);
    setProgress(0);
    webViewRef.current?.reload();
  }, [reloadToken, webViewRef]);

  return {
    progress,
    isLoading: progress < 1 && !hasError,
    hasError,
    onRetry: reload,
    onLoadProgress: (event: WebViewProgressEvent) => {
      setProgress(event.nativeEvent.progress);
    },
    onError: () => {
      setHasError(true);
    },
    onHttpError: () => {
      setHasError(true);
    },
    onNavigationStateChange: (state: WebViewNavigation) => {
      onPageChange?.({ url: state.url, title: state.title });
    },
    onShouldStartLoadWithRequest: (request: ShouldStartLoadRequest) => {
      const decision = decideNavigation(request.url, hosts, request.isTopFrame);
      if (decision === 'external') {
        void openUrlSafe(request.url);
      }
      return decision === 'allow';
    },
  };
}
