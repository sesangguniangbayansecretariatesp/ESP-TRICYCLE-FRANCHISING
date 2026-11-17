import { AiComplianceResult, ApplicationFormData, ApplicationStatus } from '../types/franchise';

export const TODA_ROUTES = [
  'SOFRONIO ESPAÑOLA TODA (SETODA) — Pulot Center',
  'PULOT SHORE UNLADKA (PSU) TODA — Pulot Shore',
  'IRARAY TRICYCLE OPERATORS & DRIVERS ASSN. (ITODA) — Iraray',
  'KAYA MO TODA — Panitian / Labog Corridor',
  'PUNANG TODA — Barangay Punang',
  'LABOG TRICYCLE ASSN. (LATODA) — Labog',
  'Other / Special Barangay Zone',
] as const;

export interface SangguniangBayanFranchiseRow {
  id: string;
  franchiseNo: string;
  bodyNumber: string;
  operatorName: string;
  driverName: string;
  routeTODA: string;
  chassisEngineNo: string;
  dateApplied: string;
  dateApproved: string;
  expiryDate: string;
  franchiseStatus: string;
  inspectionStatus: string;
  remarks: string;
  certifiedCorrectTo: string;
  sbSecretary: string;
  createdAt: string;
}

export function generateRefNo(): string {
  const year = new Date().getFullYear();
  const numPart = Math.floor(1000 + Math.random() * 9000);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const c1 = chars[Math.floor(Math.random() * chars.length)];
  const c2 = chars[Math.floor(Math.random() * chars.length)];
  return `SOF-ESP-TRC-${year}-${numPart}${c1}${c2}`;
}

function toIsoDateOnly(value: unknown, fallback = ''): string {
  if (!value) return fallback;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString().split('T')[0];
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  }
  return fallback;
}

export function toSangguniangBayanTableRow(app: {
  id?: string;
  refNo: string;
  bodyNumber?: string;
  applicantName: string;
  todaName?: string;
  todaRoute?: string;
  engineNumber?: string;
  vehiclePlate?: string;
  status: ApplicationStatus | string;
  submittedAt?: unknown;
  legislatorActionAt?: unknown;
  updatedAt?: unknown;
  legislatorName?: string;
  legislatorRemarks?: string;
  aiResult?: AiComplianceResult;
}): SangguniangBayanFranchiseRow {
  const today = new Date().toISOString().split('T')[0];
  const dateApplied = toIsoDateOnly(app.submittedAt, today);
  const isApproved = app.status === 'confirmed_approved';
  const dateApproved = isApproved
    ? toIsoDateOnly(app.legislatorActionAt || app.updatedAt, today)
    : '';
  let expiryDate = '';
  if (isApproved && dateApproved) {
    const exp = new Date(dateApproved);
    if (!Number.isNaN(exp.getTime())) {
      exp.setFullYear(exp.getFullYear() + 1);
      expiryDate = exp.toISOString().split('T')[0];
    }
  }

  let franchiseStatus = 'For Hearing/Inspection';
  let inspectionStatus = 'Pending Inspection';
  if (app.status === 'confirmed_approved') {
    franchiseStatus = 'Active/Approved';
    inspectionStatus = 'Passed';
  } else if (app.status === 'confirmed_denied') {
    franchiseStatus = 'Denied';
    inspectionStatus = 'Failed / Disapproved';
  } else if (app.status === 'returned') {
    franchiseStatus = 'Returned for Correction';
    inspectionStatus = 'Needs Compliance';
  }

  return {
    id: `tf-${app.refNo}`,
    franchiseNo: app.refNo,
    bodyNumber: app.bodyNumber || 'Pending',
    operatorName: app.applicantName,
    driverName: app.applicantName,
    routeTODA: [app.todaName, app.todaRoute].filter(Boolean).join(' — ') || 'Unassigned Route',
    chassisEngineNo: `${app.engineNumber || 'N/A'} / Plate: ${app.vehiclePlate || 'N/A'}`,
    dateApplied,
    dateApproved,
    expiryDate,
    franchiseStatus,
    inspectionStatus,
    remarks: app.legislatorRemarks || app.aiResult?.summary || 'Submitted via Tricycle Franchise Portal.',
    certifiedCorrectTo: 'Hon. Members of the Sangguniang Bayan',
    sbSecretary: app.legislatorName || 'Sangguniang Bayan Secretariat',
    createdAt: new Date().toISOString(),
  };
}

export function classifyApplication(form: ApplicationFormData): AiComplianceResult {
  const denyReasons: string[] = [];
  const flagReasons: string[] = [];

  // Mandatory Sec. 39(3) & Sec. 24 checks
  if (!form.attachments.license) {
    denyReasons.push("Missing Valid Professional Driver's License attachment (Sec. 39(3) — Auto Deny trigger).");
  }

  if (!form.attachments.cr) {
    denyReasons.push("Missing LTO Certificate of Registration (CR) & latest OR in applicant's name (Sec. 24(6) — Auto Deny trigger).");
  }

  if (!form.citizenshipAttested) {
    denyReasons.push('Applicant did not attest Filipino citizenship as required under Sec. 24(1).');
  }

  if (form.licenseExpiry) {
    const expiryDate = new Date(form.licenseExpiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!Number.isNaN(expiryDate.getTime())) {
      if (expiryDate < today) {
        denyReasons.push(`Driver's License expired on ${form.licenseExpiry} (Sec. 39(3)).`);
      } else {
        const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) {
          flagReasons.push(`Driver's License expires within ${diffDays} day(s) (${form.licenseExpiry}).`);
        }
      }
    }
  }

  // Supporting documentary completeness checks
  const supportingMissing: string[] = [];
  if (!form.attachments.citizenship) supportingMissing.push('Filipino citizenship proof');
  if (!form.attachments.ctc) supportingMissing.push('CTC / Cedula');
  if (!form.attachments.brgy) supportingMissing.push('Barangay certification');
  if (!form.attachments.toda) supportingMissing.push('TODA Clearance');
  if (!form.attachments.fed) supportingMissing.push('Federation Clearance');
  if (!form.attachments.insurance) supportingMissing.push('Passenger liability insurance');
  if (!form.attachments.medical) supportingMissing.push('Medical certificate');
  if (form.applicationType === 'new' && !form.attachments.affidavit) {
    supportingMissing.push('Conversion affidavit (new applicant)');
  }

  if (!form.bodyNumber.trim()) flagReasons.push('Body Number not provided.');
  if (!form.engineNumber.trim()) flagReasons.push('Engine Number not provided.');
  if (!form.ltoCrNumber.trim()) flagReasons.push('LTO CR Number not provided.');
  if (!form.todaName.trim()) flagReasons.push('TODA Name not specified.');

  if (supportingMissing.length > 0) {
    flagReasons.push(`Incomplete supporting documents: ${supportingMissing.join(', ')}.`);
  }

  if (denyReasons.length > 0) {
    return {
      decision: 'deny',
      summary: 'Recommended for DENIAL under Ordinance No. 1995-05 mandatory requirements.',
      reasons: [...denyReasons, ...flagReasons].slice(0, 15),
    };
  }

  if (flagReasons.length > 0) {
    return {
      decision: 'flag',
      summary: 'Flagged for Sangguniang Bayan / Board review due to incomplete supporting items.',
      reasons: flagReasons.slice(0, 15),
    };
  }

  return {
    decision: 'approve',
    summary: 'Meets Ordinance No. 1995-05 completeness checks; recommended for Board approval.',
    reasons: ['All mandatory and supporting documentary requirements verified by applicant checklist.'],
  };
}

export function formatStatusLabel(status: ApplicationStatus | string): string {
  switch (status) {
    case 'awaiting_confirmation':
      return 'Awaiting Legislator Confirmation';
    case 'confirmed_approved':
      return 'Approved by Sangguniang Bayan';
    case 'confirmed_denied':
      return 'Denied by Sangguniang Bayan';
    case 'returned':
      return 'Returned for Correction';
    default:
      return status;
  }
}

export function formatTimestamp(value: unknown): string {
  if (!value) return 'Just now';
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toLocaleString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString();
    }
  }
  return 'Recorded';
}
