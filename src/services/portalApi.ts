import {
  AiComplianceResult,
  ApplicationFormData,
  ApplicationRecord,
  ApplicationStatus,
} from '../types/franchise';

export async function fetchAllApplications(): Promise<ApplicationRecord[]> {
  const res = await fetch('/api/applications');
  if (!res.ok) {
    throw new Error(`Failed to fetch applications (${res.status}).`);
  }
  const json = (await res.json()) as { applications?: ApplicationRecord[] };
  return Array.isArray(json.applications) ? json.applications : [];
}

export async function submitApplicationToPortal(
  form: ApplicationFormData,
  refNo: string,
  aiResult: AiComplianceResult
): Promise<ApplicationRecord> {
  const res = await fetch('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...form,
      refNo,
      aiResult,
      userId: 'portal-applicant',
    }),
  });
  const json = (await res.json()) as { application?: ApplicationRecord; error?: string };
  if (!res.ok || !json.application) {
    throw new Error(json.error || `Failed to save application (${res.status}).`);
  }
  return json.application;
}

export async function lookupApplicationByRef(refNo: string): Promise<ApplicationRecord | null> {
  const cleanRef = refNo.trim().toUpperCase();
  if (!cleanRef) return null;
  const res = await fetch(`/api/applications/lookup/${encodeURIComponent(cleanRef)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Lookup failed (${res.status}).`);
  }
  const json = (await res.json()) as { application?: ApplicationRecord };
  return json.application || null;
}

export async function updateLegislatorDecision(
  id: string,
  payload: {
    status: ApplicationStatus;
    legislatorName: string;
    legislatorRemarks: string;
  }
): Promise<ApplicationRecord> {
  const res = await fetch(`/api/applications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { application?: ApplicationRecord; error?: string };
  if (!res.ok || !json.application) {
    throw new Error(json.error || `Failed to update decision (${res.status}).`);
  }
  return json.application;
}
