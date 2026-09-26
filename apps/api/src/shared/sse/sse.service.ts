import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

// Event pushed to one workspace's SSE stream (TRD §5.3). `type` drives the
// frontend's DOM update (`credit_updated`, `campaign_updated`,
// `contact_updated`); `data` carries the fresh state.
export interface WorkspaceEvent {
  type: string;
  data: unknown;
}

// Central hub for server-sent events (TRD §7.7). One Subject per workspace;
// emitters (delivery worker, webhook handlers) never touch HTTP directly.
@Injectable()
export class SseService {
  private readonly streams = new Map<string, Subject<WorkspaceEvent>>();

  getStream(workspaceId: string): Observable<WorkspaceEvent> {
    let stream = this.streams.get(workspaceId);
    if (!stream) {
      stream = new Subject<WorkspaceEvent>();
      this.streams.set(workspaceId, stream);
    }
    return stream.asObservable();
  }

  emit(workspaceId: string, type: string, data: unknown): void {
    this.streams.get(workspaceId)?.next({ type, data });
  }
}
