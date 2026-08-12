import { useEffect, useRef, useState } from 'react';
import { Card, ErrorState, Loading } from '../components/ui';
import { PageHeader } from '../components/PageHeader';

/**
 * The Tableau Public viz to embed. The share snippet expresses this as a
 * `path` param of `shared/K7RTFZCTW`; the Embedding API takes the same thing
 * as a full URL.
 */
const VIZ_URL = 'https://public.tableau.com/shared/K7RTFZCTW';

const EMBED_API_SRC =
  'https://public.tableau.com/javascripts/api/tableau.embedding.3.latest.min.js';

/*
 * The dashboard is authored at a fixed 1600 × 927, and Tableau does not scale a
 * fixed-size viz down to fit — given a narrower frame it renders at native size
 * behind its own internal scrollbars. So we pin the native size and let the
 * card scroll instead, which is what the share snippet does too. Below 500px
 * the workbook switches to its phone layout, which is far taller.
 */
const DESKTOP_SIZE = { width: 1600, height: 927 };
const PHONE_HEIGHT = 3277;
const PHONE_BREAKPOINT = 500;

/*
 * Tableau's share snippet uses the legacy `viz_v1.js`, which works by scanning
 * the document for `<object class="tableauViz">` and swapping it for an iframe.
 * That fights React's ownership of the DOM (and double-runs under StrictMode),
 * so this uses the current Embedding API v3 instead: a `<tableau-viz>` custom
 * element pointed at the same viz. The script is loaded once and cached on the
 * module, so navigating away and back doesn't refetch it.
 */
let embedApiPromise: Promise<void> | null = null;

function loadEmbedApi(): Promise<void> {
  if (embedApiPromise) return embedApiPromise;

  embedApiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${EMBED_API_SRC}"]`);
    if (existing) {
      // Another mount already started the load — piggyback on it.
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('failed to load')));
      return;
    }

    const script = document.createElement('script');
    script.type = 'module';
    script.src = EMBED_API_SRC;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () =>
      reject(new Error('Could not reach public.tableau.com')),
    );
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    // Don't cache a rejection — a retry should be able to try the network again.
    embedApiPromise = null;
    throw err;
  });

  return embedApiPromise;
}

export function TableauPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);

    loadEmbedApi()
      .then(() => {
        if (cancelled) return;
        const container = containerRef.current;
        if (!container) return;

        // Build the element imperatively rather than in JSX: `<tableau-viz>` is
        // a custom element, so React would treat unknown props as attributes
        // anyway, and this keeps the teardown unambiguous under StrictMode.
        container.replaceChildren();
        const viz = document.createElement('tableau-viz');
        viz.setAttribute('src', VIZ_URL);
        viz.setAttribute('toolbar', 'bottom');
        viz.setAttribute('hide-tabs', '');

        const phone = container.clientWidth > 0 && container.clientWidth < PHONE_BREAKPOINT;
        viz.style.display = 'block';
        viz.style.width = phone ? '100%' : `${DESKTOP_SIZE.width}px`;
        viz.style.height = `${phone ? PHONE_HEIGHT : DESKTOP_SIZE.height}px`;
        container.appendChild(viz);

        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load the Tableau embed');
        setStatus('error');
      });

    return () => {
      cancelled = true;
      containerRef.current?.replaceChildren();
    };
  }, [attempt]);

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-7">
      <PageHeader
        title="Tableau Dashboard"
        description="A published Tableau Public workbook, embedded alongside the in-app analytics."
        actions={
          <a
            href={`${VIZ_URL}?:display_count=n&:origin=viz_share_link`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-plane"
          >
            Open on Tableau Public ↗
          </a>
        }
      />

      <Card
        title="Dashboard 1"
        subtitle="Served by public.tableau.com — this view is not backed by the CRM database."
      >
        {status === 'error' && error ? (
          <ErrorState
            message={`${error}. The embed is hosted by Tableau Public, so a network block or an unpublished workbook will both look like this.`}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        ) : (
          <>
            {status === 'loading' && <Loading label="Loading Tableau embed…" />}
            {/*
              The viz is wider than the card on most screens, so it scrolls
              here rather than pushing the page sideways. Kept mounted (just
              hidden) while loading, because the effect needs the ref.
            */}
            <div
              ref={containerRef}
              className={`w-full overflow-x-auto ${status === 'ready' ? '' : 'hidden'}`}
            />
          </>
        )}
      </Card>
    </div>
  );
}
