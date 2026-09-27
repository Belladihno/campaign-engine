import { useEffect, useRef, useState } from 'react';
import { apiBase } from './client';

export interface CreditUpdated {
  credits: number;
  reference: string;
}

export interface CampaignUpdated {
  campaignId: string;
  status: string;
  sentCount?: number;
  failedCount?: number;
}

export interface ContactUpdated {
  contactId: string;
  campaignId: string;
  status: string;
}

interface EventHandlers {
  onCredit?: (data: CreditUpdated) => void;
  onCampaign?: (data: CampaignUpdated) => void;
  onContact?: (data: ContactUpdated) => void;
}

/* Single EventSource per mount. Handlers ride a ref so page callbacks
   never resubscribe the stream; a token change reconnects. */
export function useWorkspaceEvents(
  token: string | null,
  handlers: EventHandlers,
): boolean {
  const [live, setLive] = useState(false);
  const ref = useRef(handlers);

  // Sync latest callbacks every render (no dep array = no resubscribe
  // pressure); the subscribe effect below depends on token only.
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!token) {
      return;
    }    const source = new EventSource(
      `${apiBase()}/campaigns/events?token=${encodeURIComponent(token)}`,
    );
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    const listen = <T,>(
      type: string,
      fn: (data: T) => void,
    ): (() => void) => {
      const handler = (e: MessageEvent) => {
        try {
          fn(JSON.parse(e.data) as T);
        } catch {
          // Malformed frames are dropped, never crash the stream.
        }
      };
      source.addEventListener(type, handler);
      return () => source.removeEventListener(type, handler);
    };
    const offs = [
      listen<CreditUpdated>('credit_updated', (d) => ref.current.onCredit?.(d)),
      listen<CampaignUpdated>('campaign_updated', (d) =>
        ref.current.onCampaign?.(d),
      ),
      listen<ContactUpdated>('contact_updated', (d) =>
        ref.current.onContact?.(d),
      ),
    ];
    return () => {
      offs.forEach((off) => off());
      source.close();
      setLive(false);
    };
  }, [token]);

  return live;
}
