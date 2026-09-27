/* Shared API shapes (mirror the backend DTOs). */

export interface Workspace {
  id: string;
  name: string;
  credits: number;
  createdAt: string;
}

export type CampaignStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'PARTIALLY_SENT'
  | 'FAILED';

export type ContactStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';

export interface Contact {
  id: string;
  campaignId: string;
  workspaceId: string;
  phone: string;
  status: ContactStatus;
  atMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  workspaceId: string;
  name: string;
  message: string;
  status: CampaignStatus;
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  contacts?: Contact[];
}
