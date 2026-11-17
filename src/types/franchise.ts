export type ApplicationType = 'new' | 'renewal';

export type ApplicationStatus =
  | 'awaiting_confirmation'
  | 'confirmed_approved'
  | 'confirmed_denied'
  | 'returned';

export type RecommendationDecision = 'approve' | 'flag' | 'deny';

export interface AttachmentChecklist {
  license: boolean;
  cr: boolean;
  citizenship: boolean;
  ctc: boolean;
  brgy: boolean;
  toda: boolean;
  fed: boolean;
  insurance: boolean;
  medical: boolean;
  affidavit: boolean;
}

export interface AiComplianceResult {
  decision: RecommendationDecision;
  summary: string;
  reasons: string[];
}

export interface ApplicationFormData {
  applicationType: ApplicationType;
  applicantName: string;
  contactNumber: string;
  applicantAddress: string;
  ctcNumber: string;
  citizenshipAttested: boolean;
  bodyNumber: string;
  engineNumber: string;
  vehiclePlate: string;
  ltoCrNumber: string;
  ltoOrNumber: string;
  licenseNumber: string;
  licenseExpiry: string;
  todaName: string;
  todaRoute: string;
  attachments: AttachmentChecklist;
}

export interface ApplicationRecord extends ApplicationFormData {
  id: string;
  refNo: string;
  userId: string;
  aiResult: AiComplianceResult;
  status: ApplicationStatus;
  submittedAt: unknown;
  updatedAt?: unknown;
  legislatorName?: string;
  legislatorRemarks?: string;
  legislatorActionAt?: unknown;
  driveFileId?: string;
  driveFolderUrl?: string;
}
