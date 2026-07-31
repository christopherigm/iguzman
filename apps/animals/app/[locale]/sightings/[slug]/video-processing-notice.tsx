'use client';

import { useEffect } from 'react';
import { useRouter } from '@repo/i18n/navigation';

/**
 * Re-reads the page while a clip is still being converted.
 *
 * ⚠ **Polling, not a live channel, and that is a deliberate choice.** A push
 * update would mean an SSE endpoint plus somewhere for the transcode - which
 * runs in a different process, on whichever replica received the upload - to
 * publish to. animals-api has Redis but no pub/sub wiring, and the whole point of
 * putting the status on the row was that any replica can answer "is it ready?"
 * from the database. So this asks again.
 *
 * `router.refresh()` rather than a fetch of our own: the status lives on the
 * sighting payload the server component already renders, so re-running that is
 * both the smallest change and the one that cannot drift from what the page
 * shows. When the clip turns ready the refreshed render simply has a player in
 * place of this notice, and this component unmounts with it.
 *
 * The interval is slow on purpose. A transcode is minutes, this re-renders a
 * whole route on the server, and every reader with the page open is doing it -
 * so a tight poll would put avoidable load on the same pods that are busy
 * encoding. It also gives up: a clip that outlives the API's own abandonment
 * timeout is reported `failed` by then, and a page left open overnight must not
 * poll until the tab is closed.
 */

const POLL_MS = 20_000;
/** Stop after this long; the API reports an abandoned transcode failed by ~45 min. */
const GIVE_UP_MS = 50 * 60_000;

export function VideoProcessingNotice() {
  const router = useRouter();

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > GIVE_UP_MS) {
        clearInterval(timer);
        return;
      }
      // Only while the tab is actually being looked at - a backgrounded page
      // refreshing every 20 s for an hour is pure waste on both ends.
      if (document.visibilityState === 'visible') router.refresh();
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [router]);

  return null;
}
