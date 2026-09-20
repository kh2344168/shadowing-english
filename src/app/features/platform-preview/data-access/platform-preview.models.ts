export type AccountStatus = 'active' | 'expired' | 'paused';
export type SupervisorStatus = 'active' | 'paused';
export type SummaryStatus = 'pending' | 'accepted' | 'resubmit';
export type PublicationStatus = 'published' | 'scheduled';

export interface SupervisorPreview {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: SupervisorStatus;
  canViewAllGroups: boolean;
  groupIds: string[];
  createdAt: string;
}

export interface SubscriptionPreview {
  studentId: string;
  billingMode: 'monthly' | 'full-program';
  programMonths: 4;
  paidMonths: number;
  currentMonth: number;
  startDate: string;
  endDate: string;
  status: AccountStatus;
  updatedAt: string;
}

export interface WeeklySummaryPreview {
  id: string;
  studentId: string;
  groupId: string;
  weekNumber: number;
  durationSeconds: number;
  submittedAt: string;
  status: SummaryStatus;
  rating?: number;
  note?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface StudentMessagePreview {
  id: string;
  studentId: string;
  senderName: string;
  subject: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface WeekPublicationPreview {
  id: string;
  groupId: string;
  weekNumber: number;
  status: PublicationStatus;
  scheduledAt?: string;
  publishedAt?: string;
}

export interface PlatformPreviewStore {
  supervisors: SupervisorPreview[];
  subscriptions: SubscriptionPreview[];
  weeklySummaries: WeeklySummaryPreview[];
  messages: StudentMessagePreview[];
  publications: WeekPublicationPreview[];
}
