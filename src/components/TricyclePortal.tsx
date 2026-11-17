import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAllApplications,
  lookupApplicationByRef,
  submitApplicationToPortal,
  updateLegislatorDecision,
} from '../services/portalApi';
import {
  ApplicationFormData,
  ApplicationRecord,
  ApplicationStatus,
  AttachmentChecklist,
} from '../types/franchise';
import {
  classifyApplication,
  formatStatusLabel,
  formatTimestamp,
  generateRefNo,
  TODA_ROUTES,
  toSangguniangBayanTableRow,
} from '../utils/compliance';

interface TricyclePortalProps {
  role: 'applicant' | 'staff' | null;
  initialLookupRef?: string | null;
  onExit: () => void;
}

interface BannerMessage {
  type: 'success' | 'error' | 'warning';
  text: string;
}

const INITIAL_ATTACHMENTS: AttachmentChecklist = {
  license: false,
  cr: false,
  citizenship: false,
  ctc: false,
  brgy: false,
  toda: false,
  fed: false,
  insurance: false,
  medical: false,
  affidavit: false,
};

const INITIAL_FORM: ApplicationFormData = {
  applicationType: 'new',
  applicantName: '',
  contactNumber: '',
  applicantAddress: '',
  ctcNumber: '',
  citizenshipAttested: false,
  bodyNumber: '',
  engineNumber: '',
  vehiclePlate: '',
  ltoCrNumber: '',
  ltoOrNumber: '',
  licenseNumber: '',
  licenseExpiry: '',
  todaName: '',
  todaRoute: '',
  attachments: { ...INITIAL_ATTACHMENTS },
};

const ATTACHMENT_LABELS: { key: keyof AttachmentChecklist; label: string }[] = [
  { key: 'license', label: "Valid Professional Driver's License (LTO-issued)" },
  { key: 'cr', label: "LTO CR & latest OR in applicant's name" },
  { key: 'citizenship', label: 'Filipino citizenship document' },
  { key: 'ctc', label: 'Community Tax Certificate / Cedula' },
  { key: 'brgy', label: 'Barangay certification' },
  { key: 'toda', label: 'TODA Clearance' },
  { key: 'fed', label: 'Federation Clearance' },
  { key: 'insurance', label: 'Passenger liability insurance' },
  { key: 'medical', label: 'Medical certificate (fit to drive)' },
  { key: 'affidavit', label: 'Conversion affidavit (new applicants)' },
];

function getLocalApps(): ApplicationRecord[] {
  try {
    const raw = localStorage.getItem('sof_esp_apps');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalApps(apps: ApplicationRecord[]): void {
  try {
    localStorage.setItem('sof_esp_apps', JSON.stringify(apps));
  } catch {
    // Ignore storage quota errors
  }
}

function getSavedLastRef(): string {
  try {
    return localStorage.getItem('sof_esp_last_ref') || '';
  } catch {
    return '';
  }
}

function saveLastRef(refNo: string): void {
  try {
    localStorage.setItem('sof_esp_last_ref', refNo);
  } catch {
    // Ignore storage quota errors
  }
}

function formatFriendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (parsed && typeof parsed.error === 'string') {
      if (parsed.error.toLowerCase().includes('quota exceeded')) {
        return 'Firestore daily free quota exceeded. Please try again tomorrow or upgrade the Firebase plan.';
      }
      if (parsed.error.toLowerCase().includes('missing or insufficient permissions')) {
        return 'Permission denied by Firestore security rules. Please make sure you are signed in with the correct Google account.';
      }
      return parsed.error;
    }
  } catch {
    // Not JSON
  }
  return error.message || fallback;
}

function getStatusBadgeClass(status: ApplicationStatus | string): string {
  switch (status) {
    case 'confirmed_approved':
      return 'badge confirmed-approve';
    case 'confirmed_denied':
      return 'badge confirmed-denied';
    case 'returned':
      return 'badge returned';
    default:
      return 'badge pending';
  }
}

function getRecommendationBadgeClass(decision?: string): string {
  if (decision === 'approve') return 'badge approve';
  if (decision === 'deny') return 'badge deny';
  if (decision === 'flag') return 'badge flag';
  return 'badge pending';
}

function StatusSeal({ status }: { status: ApplicationStatus | string }) {
  if (status === 'confirmed_approved') {
    return (
      <div className="seal" aria-label="Approved Seal">
        <svg viewBox="0 0 80 80" width="72" height="72">
          <circle cx="40" cy="40" r="36" fill="#D6E9E0" stroke="#0e7c53" strokeWidth="3" />
          <circle cx="40" cy="40" r="29" fill="none" stroke="#e2b00a" strokeWidth="1.5" strokeDasharray="3 2" />
          <path d="M26 41 L36 51 L55 30" fill="none" stroke="#0e7c53" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  if (status === 'confirmed_denied') {
    return (
      <div className="seal" aria-label="Denied Seal">
        <svg viewBox="0 0 80 80" width="72" height="72">
          <circle cx="40" cy="40" r="36" fill="#F4E3E1" stroke="#8C2F2F" strokeWidth="3" />
          <path d="M28 28 L52 52 M52 28 L28 52" fill="none" stroke="#8C2F2F" strokeWidth="4.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="seal" aria-label="Pending Review Seal">
      <svg viewBox="0 0 80 80" width="72" height="72">
        <circle cx="40" cy="40" r="36" fill="#FDF6E0" stroke="#e2b00a" strokeWidth="3" />
        <circle cx="40" cy="40" r="28" fill="none" stroke="#8c6a00" strokeWidth="1" strokeDasharray="3 3" />
        <path d="M40 24 V41 L51 47" fill="none" stroke="#8c6a00" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function TricyclePortal({
  role,
  initialLookupRef,
  onExit,
}: TricyclePortalProps) {
  const [activeTab, setActiveTab] = useState<'apply' | 'status' | 'dashboard'>(
    initialLookupRef ? 'status' : role === 'staff' ? 'dashboard' : 'apply'
  );
  const [formData, setFormData] = useState<ApplicationFormData>(INITIAL_FORM);
  const [banner, setBanner] = useState<BannerMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState<ApplicationRecord | null>(null);

  // Status Lookup State
  const [lookupRef, setLookupRef] = useState(() => initialLookupRef || getSavedLastRef());
  const [statusResult, setStatusResult] = useState<ApplicationRecord | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [myApps, setMyApps] = useState<ApplicationRecord[]>(() => getLocalApps());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Staff Dashboard State
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ApplicationStatus>('all');
  const [dashboardView, setDashboardView] = useState<'queue' | 'etala'>('queue');
  const [selectedApp, setSelectedApp] = useState<ApplicationRecord | null>(null);
  const [legislatorName, setLegislatorName] = useState('');
  const [legislatorRemarks, setLegislatorRemarks] = useState('');
  const [isUpdatingDecision, setIsUpdatingDecision] = useState(false);

  const loadDashboardApps = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoadingDashboard(true);
    try {
      const serverApps = await fetchAllApplications();
      setApplications(serverApps);
      setSelectedApp((prev) =>
        prev ? serverApps.find((a) => a.id === prev.id || a.refNo === prev.refNo) || prev : null
      );
      setDashboardError(null);
    } catch {
      const localApps = getLocalApps();
      setApplications(localApps);
      setDashboardError('Unable to reach server storage. Showing saved browser records.');
    } finally {
      if (showSpinner) setIsLoadingDashboard(false);
    }
  }, []);

  // Poll Staff Dashboard every 5s so newly submitted applications appear directly
  useEffect(() => {
    if (activeTab !== 'dashboard' || role !== 'staff') return;
    loadDashboardApps(true);
    const timer = window.setInterval(() => {
      loadDashboardApps(false);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeTab, role, loadDashboardApps]);

  // Refresh local submissions list and keep active status result live-updated
  useEffect(() => {
    if (activeTab !== 'status') return;
    const targetRef = (
      initialLookupRef ||
      statusResult?.refNo ||
      lookupRef ||
      myApps[0]?.refNo ||
      ''
    )
      .trim()
      .toUpperCase();

    const syncStatus = async () => {
      if (!targetRef) return;
      if (!lookupRef) setLookupRef(targetRef);
      try {
        const live = await lookupApplicationByRef(targetRef);
        if (live) {
          setStatusResult(live);
          saveLastRef(live.refNo);
          setMyApps((prev) => {
            const exists = prev.some((p) => p.refNo.toUpperCase() === live.refNo.toUpperCase());
            const updated = exists
              ? prev.map((p) => (p.refNo.toUpperCase() === live.refNo.toUpperCase() ? live : p))
              : [live, ...prev];
            saveLocalApps(updated);
            return updated;
          });
          return;
        }
      } catch {
        // Fallback to local records
      }

      if (!statusResult) {
        const localMatch = getLocalApps().find(
          (a) => String(a.refNo || '').toUpperCase() === targetRef
        );
        if (localMatch) {
          setStatusResult(localMatch);
        }
      }
    };

    syncStatus();
    const timer = window.setInterval(syncStatus, 5000);
    return () => window.clearInterval(timer);
  }, [activeTab, initialLookupRef, lookupRef, statusResult?.refNo]);

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      attachments: { ...prev.attachments, [name]: checked },
    }));
  };

  const handleCopyText = async (text: string, key: string, successText: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setBanner({ type: 'success', text: successText });
      setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 2500);
    } catch {
      setBanner({ type: 'warning', text: 'Clipboard copy was blocked by browser permissions.' });
    }
  };

  const handleDownloadJsonCopy = (record: ApplicationRecord) => {
    const payload = JSON.stringify(
      {
        refNo: record.refNo,
        municipality: 'Municipality of Sofronio Española, Palawan',
        ordinance: 'Ordinance No. 1995-05',
        submittedAt: record.submittedAt,
        automatedComplianceSummary: record.aiResult.summary,
        application: record,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${record.refNo}_${record.applicantName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);

    if (
      !formData.applicantName.trim() ||
      !formData.contactNumber.trim() ||
      !formData.applicantAddress.trim() ||
      !formData.vehiclePlate.trim() ||
      !formData.licenseNumber.trim() ||
      !formData.licenseExpiry.trim() ||
      !formData.todaRoute.trim()
    ) {
      setBanner({
        type: 'error',
        text: 'Please complete all required fields (Name, Contact, Address, Plate No., Driver License, Expiry, and TODA Route).',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const refNo = generateRefNo();
      const sanitizedForm: ApplicationFormData = {
        applicationType: formData.applicationType,
        applicantName: formData.applicantName.trim().slice(0, 150),
        contactNumber: formData.contactNumber.trim().slice(0, 40),
        applicantAddress: formData.applicantAddress.trim().slice(0, 250),
        ctcNumber: formData.ctcNumber.trim().slice(0, 60),
        citizenshipAttested: formData.citizenshipAttested,
        bodyNumber: formData.bodyNumber.trim().slice(0, 50),
        engineNumber: formData.engineNumber.trim().slice(0, 60),
        vehiclePlate: formData.vehiclePlate.trim().toUpperCase().slice(0, 40),
        ltoCrNumber: formData.ltoCrNumber.trim().slice(0, 60),
        ltoOrNumber: formData.ltoOrNumber.trim().slice(0, 60),
        licenseNumber: formData.licenseNumber.trim().slice(0, 60),
        licenseExpiry: formData.licenseExpiry.trim().slice(0, 20),
        todaName: formData.todaName.trim().slice(0, 120),
        todaRoute: formData.todaRoute.trim().slice(0, 160),
        attachments: { ...formData.attachments },
      };

      const aiResult = classifyApplication(sanitizedForm);

      let savedRecord: ApplicationRecord;
      try {
        savedRecord = await submitApplicationToPortal(sanitizedForm, refNo, aiResult);
      } catch {
        // Offline / fallback persistence if server endpoint is temporarily unreachable
        savedRecord = {
          ...sanitizedForm,
          id: `local-${Date.now()}`,
          refNo,
          userId: 'portal-applicant',
          aiResult,
          status: 'awaiting_confirmation',
          submittedAt: new Date().toISOString(),
        };
      }

      const existingLocal = getLocalApps().filter(
        (item) => item.refNo.toUpperCase() !== savedRecord.refNo.toUpperCase()
      );
      const updatedLocal = [savedRecord, ...existingLocal];
      saveLocalApps(updatedLocal);
      saveLastRef(savedRecord.refNo);
      setMyApps(updatedLocal);

      setLastSubmitted(savedRecord);
      setLookupRef(savedRecord.refNo);
      setStatusResult(savedRecord);

      setBanner({
        type: 'success',
        text: `Application saved directly to the Legislator / Staff Dashboard! Auto-generated Reference No: ${savedRecord.refNo}`,
      });

      setFormData(INITIAL_FORM);
    } catch (error) {
      setBanner({
        type: 'error',
        text: formatFriendlyError(
          error,
          'Failed to submit application. Please verify your connection and try again.'
        ),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLookup = async (targetRef?: string) => {
    const queryRef = (targetRef ?? lookupRef).trim().toUpperCase();
    if (!queryRef) {
      setBanner({ type: 'error', text: 'Enter a reference number to look up.' });
      return;
    }

    setBanner(null);
    setIsLookingUp(true);
    try {
      let found: ApplicationRecord | null = null;
      try {
        found = await lookupApplicationByRef(queryRef);
      } catch {
        found = null;
      }

      if (!found) {
        const localMatch = getLocalApps().find(
          (a) => String(a.refNo || '').toUpperCase() === queryRef
        );
        if (localMatch) found = localMatch;
      }

      if (found) {
        saveLastRef(found.refNo);
        setStatusResult(found);
      } else {
        setStatusResult(null);
        setBanner({
          type: 'warning',
          text: `No application found for reference "${queryRef}". Please verify the Reference Number given at submission.`,
        });
      }
    } catch (error) {
      setStatusResult(null);
      setBanner({
        type: 'error',
        text: formatFriendlyError(error, 'Unable to complete lookup.'),
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleLegislatorDecision = async (newStatus: ApplicationStatus) => {
    if (!selectedApp) return;
    setBanner(null);

    if (!legislatorName.trim()) {
      setBanner({
        type: 'error',
        text: 'Please enter the confirming Legislator / Sangguniang Bayan Member name.',
      });
      return;
    }

    setIsUpdatingDecision(true);
    try {
      const cleanName = legislatorName.trim().slice(0, 150);
      const cleanRemarks = legislatorRemarks.trim().slice(0, 500);

      let updatedRecord: ApplicationRecord;
      if (selectedApp.id.startsWith('local-')) {
        updatedRecord = {
          ...selectedApp,
          status: newStatus,
          legislatorName: cleanName,
          legislatorRemarks: cleanRemarks,
          legislatorActionAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else {
        updatedRecord = await updateLegislatorDecision(selectedApp.id, {
          status: newStatus,
          legislatorName: cleanName,
          legislatorRemarks: cleanRemarks,
        });
      }

      setApplications((prev) =>
        prev.map((app) =>
          app.id === updatedRecord.id || app.refNo === updatedRecord.refNo ? updatedRecord : app
        )
      );
      setSelectedApp(updatedRecord);

      const updatedLocal = getLocalApps().map((app) =>
        app.refNo.toUpperCase() === updatedRecord.refNo.toUpperCase() ? updatedRecord : app
      );
      saveLocalApps(updatedLocal);
      setMyApps(updatedLocal);

      setBanner({
        type: 'success',
        text: `Application ${updatedRecord.refNo} updated to "${formatStatusLabel(newStatus)}" by ${cleanName}.`,
      });
    } catch (error) {
      setBanner({
        type: 'error',
        text: formatFriendlyError(error, 'Failed to update application decision.'),
      });
    } finally {
      setIsUpdatingDecision(false);
    }
  };

  const filteredApplications = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return applications.filter((app) => {
      if (statusFilter !== 'all' && app.status !== statusFilter) return false;
      if (!q) return true;
      return (
        app.refNo.toLowerCase().includes(q) ||
        app.applicantName.toLowerCase().includes(q) ||
        app.vehiclePlate.toLowerCase().includes(q) ||
        (app.todaRoute || '').toLowerCase().includes(q)
      );
    });
  }, [applications, searchTerm, statusFilter]);

  const stats = useMemo(
    () => ({
      total: applications.length,
      awaiting: applications.filter((a) => a.status === 'awaiting_confirmation').length,
      approved: applications.filter((a) => a.status === 'confirmed_approved').length,
      denied: applications.filter((a) => a.status === 'confirmed_denied').length,
    }),
    [applications]
  );

  return (
    <div className="min-h-screen bg-[#F8F9F7]">
      <div className="masthead">
        <div className="masthead-inner">
          <div className="seal-mark">
            LGU
            <br />
            ESP
          </div>
          <div className="flex-1 min-w-0">
            <h1>Municipality of Sofronio Española Tricycle Franchise Portal</h1>
            <div className="sub">
              Implements <b>Ordinance No. 1995-05</b>. The Tricycle Management Code of Sofronio
              Española, Palawan. Automated checks are for{' '}
              <b>recommendation only - all decisions require legislator confirmation.</b>
            </div>
          </div>
          <div className="masthead-actions">
            <button
              type="button"
              onClick={onExit}
              className="btn outline sm"
            >
              {role === 'staff' ? 'Logout' : 'Back to Homepage'}
            </button>
          </div>
        </div>

        <div className="tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'apply' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('apply');
              setBanner(null);
            }}
          >
            Submit Application
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'status' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('status');
              setBanner(null);
            }}
          >
            Check Status &amp; Permit
          </button>
          {role === 'staff' && (
            <button
              type="button"
              className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('dashboard');
                setBanner(null);
              }}
            >
              Legislator / Staff Dashboard
            </button>
          )}
        </div>
      </div>

      <main>
        {banner && (
          <div className={`alert-banner ${banner.type} no-print`} role="alert">
            <span>{banner.text}</span>
            <button
              type="button"
              className="btn outline sm"
              onClick={() => setBanner(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: SUBMIT APPLICATION */}
        {activeTab === 'apply' && (
          <div className="view active">
            {lastSubmitted && (
              <div className="panel" style={{ borderColor: '#0e7c53' }}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="panel-title">Application Submitted</div>
                    <p className="panel-note m-0">
                      Reference Number:{' '}
                      <strong className="tabular text-[#0e7c53] text-base">
                        {lastSubmitted.refNo}
                      </strong>
                    </p>
                  </div>
                  <span className={getRecommendationBadgeClass(lastSubmitted.aiResult.decision)}>
                    Automated Check: {lastSubmitted.aiResult.decision.toUpperCase()}
                  </span>
                </div>

                <p className="text-sm text-[#1A211D] mt-3 mb-2">
                  {lastSubmitted.aiResult.summary}
                </p>

                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      setActiveTab('status');
                      setLookupRef(lastSubmitted.refNo);
                      setStatusResult(lastSubmitted);
                      handleLookup(lastSubmitted.refNo);
                    }}
                  >
                    View Status &amp; Receipt
                  </button>

                  <button
                    type="button"
                    className="btn outline sm"
                    onClick={() => {
                      const trackUrl = `${window.location.origin}/?ref=${encodeURIComponent(
                        lastSubmitted.refNo
                      )}`;
                      handleCopyText(
                        trackUrl,
                        `track-${lastSubmitted.refNo}`,
                        `Copied direct status link for ${lastSubmitted.refNo}.`
                      );
                    }}
                  >
                    {copiedKey === `track-${lastSubmitted.refNo}`
                      ? 'Copied Status Link!'
                      : 'Copy Status Link'}
                  </button>

                  <button
                    type="button"
                    className="btn outline sm"
                    onClick={() => {
                      const row = toSangguniangBayanTableRow(lastSubmitted);
                      handleCopyText(
                        JSON.stringify(row, null, 2),
                        `etala-${lastSubmitted.refNo}`,
                        `Copied Tricycle Franchising Table JSON for sangguniangbayanesp.ai.studio (${lastSubmitted.refNo}).`
                      );
                    }}
                  >
                    {copiedKey === `etala-${lastSubmitted.refNo}`
                      ? 'Copied Table Row JSON!'
                      : 'Copy for SB Table'}
                  </button>

                  <button
                    type="button"
                    className="btn gold sm"
                    onClick={() => handleDownloadJsonCopy(lastSubmitted)}
                  >
                    Download JSON Copy
                  </button>
                </div>
              </div>
            )}

            <div className="panel">
              <div className="panel-title">New Franchise / Renewal Application</div>
              <div className="panel-note">
                Fields marked with a <span className="req-tag">REQUIRED</span> tag are required by
                Ordinance No. 1995-05. Submissions save directly to the Legislator / Staff
                Dashboard queue and generate a unique Reference Number for status tracking.
              </div>

              <div className="notice-banner">
                <b>Important:</b> This portal performs completeness checks only. It does not grant
                franchises. Final approval rests with the Sangguniang Bayan through the Tricycle
                Franchising Board (Sec. 7–8).
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="section-label">1 &middot; Application Type</div>
                <div className="field">
                  <label htmlFor="app-type">
                    Application Type <span className="req-tag">REQUIRED</span>
                  </label>
                  <select
                    id="app-type"
                    className="w-full md:w-1/2"
                    value={formData.applicationType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        applicationType: e.target.value as 'new' | 'renewal',
                      })
                    }
                  >
                    <option value="new">New Application</option>
                    <option value="renewal">Renewal</option>
                  </select>
                </div>

                <div className="section-label">2 &middot; Personal Information</div>
                <div className="field">
                  <label htmlFor="applicant-name">
                    Full Name <span className="req-tag">REQUIRED</span>
                  </label>
                  <input
                    id="applicant-name"
                    className="w-full md:w-1/2"
                    type="text"
                    value={formData.applicantName}
                    onChange={(e) => setFormData({ ...formData, applicantName: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="contact-no">
                    Contact Number <span className="req-tag">REQUIRED</span>
                  </label>
                  <input
                    id="contact-no"
                    className="w-full md:w-1/2"
                    type="text"
                    value={formData.contactNumber}
                    onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="applicant-address">
                    Complete Address <span className="req-tag">REQUIRED</span>
                  </label>
                  <input
                    id="applicant-address"
                    className="w-full md:w-1/2"
                    type="text"
                    value={formData.applicantAddress}
                    onChange={(e) =>
                      setFormData({ ...formData, applicantAddress: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="ctc-no">
                    CTC / Cedula No. <span className="opt-tag">OPTIONAL</span>
                  </label>
                  <input
                    id="ctc-no"
                    className="w-full md:w-1/2"
                    type="text"
                    value={formData.ctcNumber}
                    onChange={(e) => setFormData({ ...formData, ctcNumber: e.target.value })}
                  />
                </div>
                <label className="check-row required w-full md:w-1/2">
                  <input
                    type="checkbox"
                    name="citizenshipAttested"
                    checked={formData.citizenshipAttested}
                    onChange={handleCheckboxChange}
                  />
                  <span className="ctext">
                    I attest I am a Filipino citizen <span className="cite">(Sec. 24.1)</span>
                    <span className="req-tag">REQUIRED</span>
                  </span>
                </label>

                <div className="section-label">3 &middot; Motorcycle / Tricycle Unit</div>
                <div className="field">
                  <label htmlFor="body-no">
                    Body Number <span className="req-tag">REQUIRED</span>
                  </label>
                  <input
                    id="body-no"
                    className="w-full md:w-1/2"
                    type="text"
                    value={formData.bodyNumber}
                    onChange={(e) => setFormData({ ...formData, bodyNumber: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="engine-no">
                    Engine Number <span className="req-tag">REQUIRED</span>
                  </label>
                  <input
                    id="engine-no"
                    className="w-full md:w-1/2"
                    type="text"
                    value={formData.engineNumber}
                    onChange={(e) => setFormData({ ...formData, engineNumber: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="plate-no">
                    Plate Number <span className="req-tag">REQUIRED</span>
                  </label>
                  <input
                    id="plate-no"
                    className="w-full md:w-1/2"
                    type="text"
                    value={formData.vehiclePlate}
                    onChange={(e) => setFormData({ ...formData, vehiclePlate: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="cr-no">
                    LTO CR No. <span className="req-tag">REQUIRED</span>
                  </label>
                  <input
                    id="cr-no"
                    className="w-full md:w-1/2"
                    type="text"
                    value={formData.ltoCrNumber}
                    onChange={(e) => setFormData({ ...formData, ltoCrNumber: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="or-no">
                    LTO OR No. <span className="opt-tag">OPTIONAL</span>
                  </label>
                  <input
                    id="or-no"
                    className="w-full md:w-1/2"
                    type="text"
                    value={formData.ltoOrNumber}
                    onChange={(e) => setFormData({ ...formData, ltoOrNumber: e.target.value })}
                  />
                </div>

                <div className="section-label">4 &middot; Driver&apos;s License</div>
                <div className="field">
                  <label htmlFor="license-no">
                    License Number <span className="req-tag">REQUIRED</span>
                  </label>
                  <input
                    id="license-no"
                    className="w-full md:w-1/2"
                    type="text"
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="license-expiry">
                    Validity / Expiry Date <span className="req-tag">REQUIRED</span>
                  </label>
                  <input
                    id="license-expiry"
                    className="w-full md:w-1/2"
                    type="date"
                    value={formData.licenseExpiry}
                    onChange={(e) => setFormData({ ...formData, licenseExpiry: e.target.value })}
                    required
                  />
                </div>

                <div className="section-label">5 &middot; TODA &amp; Route</div>
                <div className="field">
                  <label htmlFor="toda-name">
                    TODA Name <span className="req-tag">REQUIRED</span>
                  </label>
                  <input
                    id="toda-name"
                    className="w-full md:w-1/2"
                    type="text"
                    value={formData.todaName}
                    onChange={(e) => setFormData({ ...formData, todaName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="toda-route">
                    Route / Zone <span className="req-tag">REQUIRED</span>
                  </label>
                  <select
                    id="toda-route"
                    className="w-full md:w-1/2"
                    value={formData.todaRoute}
                    onChange={(e) => setFormData({ ...formData, todaRoute: e.target.value })}
                    required
                  >
                    <option value="">Select Route…</option>
                    {TODA_ROUTES.map((route) => (
                      <option key={route} value={route}>
                        {route}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="section-label">6 &middot; Attachments Checklist</div>
                <div className="flex flex-col gap-2 w-full md:w-3/4">
                  <label className="check-row required">
                    <input
                      type="checkbox"
                      name="license"
                      checked={formData.attachments.license}
                      onChange={handleAttachmentChange}
                    />
                    <span className="ctext">
                      <span>Valid Professional Driver&apos;s License (LTO-issued)</span>
                      <span className="cite">(Sec. 39(3))</span>
                      <span className="req-tag">AUTO DENY IF MISSING</span>
                    </span>
                  </label>

                  <label className="check-row required">
                    <input
                      type="checkbox"
                      name="cr"
                      checked={formData.attachments.cr}
                      onChange={handleAttachmentChange}
                    />
                    <span className="ctext">
                      <span>LTO Certificate of Registration (CR) &amp; latest OR in applicant&apos;s name</span>
                      <span className="cite">(Sec. 24(6))</span>
                      <span className="req-tag">AUTO DENY IF MISSING</span>
                    </span>
                  </label>

                  {ATTACHMENT_LABELS.slice(2).map((item) => (
                    <label key={item.key} className="check-row">
                      <input
                        type="checkbox"
                        name={item.key}
                        checked={formData.attachments[item.key]}
                        onChange={handleAttachmentChange}
                      />
                      <span className="ctext">
                        <span>{item.label}</span>
                        <span className="opt-tag">SUPPORTING</span>
                      </span>
                    </label>
                  ))}
                </div>

                <div className="mt-4">
                  <button type="submit" className="btn" disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting Application…' : 'Submit Application'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: CHECK STATUS & PERMIT */}
        {activeTab === 'status' && (
          <div className="view active">
            <div className="panel no-print">
              <div className="panel-title">Check Status &amp; Permit</div>
              <div className="panel-note">
                Enter the reference number given at submission to view the current status. An
                official permit summary renders here only after a legislator confirms approval.
              </div>

              <div className="flex flex-col md:flex-row gap-3 md:items-end">
                <div className="field flex-1">
                  <label htmlFor="lookup-ref-input">Reference Number</label>
                  <input
                    id="lookup-ref-input"
                    className="w-full md:w-1/2 tabular"
                    type="text"
                    value={lookupRef}
                    onChange={(e) => setLookupRef(e.target.value)}
                    placeholder="SOF-ESP-TRC-2026-0001"
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={isLookingUp}
                  onClick={() => handleLookup()}
                >
                  {isLookingUp ? 'Looking Up…' : 'Look Up'}
                </button>
              </div>

              {myApps.length > 0 && (
                <div className="mt-5 pt-4 border-t border-[#D8D9D6]">
                  <div className="text-xs font-semibold text-[#5B6660] mb-2">
                    Auto-Detected Submissions for Your Account (click any reference to inspect):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {myApps.slice(0, 8).map((item) => (
                      <button
                        key={item.id || item.refNo}
                        type="button"
                        className={`btn sm tabular ${
                          statusResult?.refNo === item.refNo ? '' : 'outline'
                        }`}
                        onClick={() => {
                          setLookupRef(item.refNo);
                          saveLastRef(item.refNo);
                          setStatusResult(item);
                          handleLookup(item.refNo);
                        }}
                      >
                        {item.refNo} · {item.vehiclePlate} ({formatStatusLabel(item.status)})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {isLookingUp && (
              <div className="panel text-center text-sm text-[#5B6660]">
                Searching municipal records…
              </div>
            )}

            {!isLookingUp && statusResult && (
              <div className="panel">
                <div className="seal-wrap">
                  <StatusSeal status={statusResult.status} />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="tabular font-bold text-[#0e7c53] text-lg">
                        {statusResult.refNo}
                      </span>
                      <span className={getStatusBadgeClass(statusResult.status)}>
                        {formatStatusLabel(statusResult.status)}
                      </span>
                      <button
                        type="button"
                        className="btn outline sm no-print"
                        onClick={() => {
                          const trackUrl = `${window.location.origin}/?ref=${encodeURIComponent(
                            statusResult.refNo
                          )}`;
                          handleCopyText(
                            trackUrl,
                            `status-track-${statusResult.refNo}`,
                            `Copied direct tracking link for ${statusResult.refNo}.`
                          );
                        }}
                      >
                        {copiedKey === `status-track-${statusResult.refNo}`
                          ? 'Copied Link!'
                          : 'Copy Tracking Link'}
                      </button>
                    </div>
                    <div className="text-sm text-[#5B6660]">
                      Applicant: <strong className="text-[#1A211D]">{statusResult.applicantName}</strong> ·
                      Plate: <strong className="tabular text-[#1A211D]">{statusResult.vehiclePlate}</strong> ·
                      Submitted: {formatTimestamp(statusResult.submittedAt)}
                    </div>
                  </div>
                </div>

                {statusResult.aiResult && (
                  <div className="confirm-box">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <strong className="text-sm text-[#0e7c53]">
                        Automated Ordinance No. 1995-05 Pre-Check
                      </strong>
                      <span className={getRecommendationBadgeClass(statusResult.aiResult.decision)}>
                        Recommendation: {statusResult.aiResult.decision.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-[#1A211D] mb-2">{statusResult.aiResult.summary}</p>
                    {statusResult.aiResult.reasons && statusResult.aiResult.reasons.length > 0 && (
                      <ul className="list-disc pl-5 text-xs text-[#5B6660] space-y-1">
                        {statusResult.aiResult.reasons.map((reason, idx) => (
                          <li key={idx}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {(statusResult.status === 'confirmed_denied' || statusResult.status === 'returned') && (
                  <div className="alert-banner error mt-4">
                    <div>
                      <strong>
                        {statusResult.status === 'confirmed_denied'
                          ? 'Notice of Action — Franchise Denied'
                          : 'Returned for Applicant Correction'}
                      </strong>
                      <div className="text-sm mt-1">
                        Reviewed by: <strong>{statusResult.legislatorName || 'Sangguniang Bayan'}</strong>
                      </div>
                      {statusResult.legislatorRemarks && (
                        <div className="text-sm mt-1">Remarks: {statusResult.legislatorRemarks}</div>
                      )}
                    </div>
                  </div>
                )}

                {statusResult.status === 'confirmed_approved' && (
                  <div className="permit">
                    <div className="permit-head">
                      <div className="text-xs uppercase tracking-widest text-[#5B6660]">
                        Republic of the Philippines · Province of Palawan
                      </div>
                      <h3>Municipality of Sofronio Española</h3>
                      <div className="text-sm font-semibold text-[#1A211D]">
                        Office of the Sangguniang Bayan · Tricycle Franchising Board
                      </div>
                      <div className="mt-2 inline-block px-3 py-1 bg-[#D6E9E0] text-[#0c6344] text-xs font-bold tracking-wider uppercase">
                        Official Motorized Tricycle Operator&apos;s Permit (MTOP) Summary
                      </div>
                    </div>

                    <div className="permit-grid">
                      <div>
                        <div className="detail-item-label">Franchise Reference No.</div>
                        <div className="detail-item-val tabular">{statusResult.refNo}</div>
                      </div>
                      <div>
                        <div className="detail-item-label">Application Type</div>
                        <div className="detail-item-val uppercase">
                          {statusResult.applicationType}
                        </div>
                      </div>
                      <div>
                        <div className="detail-item-label">Operator / Grantee</div>
                        <div className="detail-item-val">{statusResult.applicantName}</div>
                      </div>
                      <div>
                        <div className="detail-item-label">Address</div>
                        <div className="detail-item-val">{statusResult.applicantAddress}</div>
                      </div>
                      <div>
                        <div className="detail-item-label">Plate Number</div>
                        <div className="detail-item-val tabular">{statusResult.vehiclePlate}</div>
                      </div>
                      <div>
                        <div className="detail-item-label">Body / Engine Number</div>
                        <div className="detail-item-val tabular">
                          {statusResult.bodyNumber || 'N/A'} / {statusResult.engineNumber || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="detail-item-label">TODA Affiliation</div>
                        <div className="detail-item-val">{statusResult.todaName || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="detail-item-label">Authorized Route / Zone</div>
                        <div className="detail-item-val">{statusResult.todaRoute}</div>
                      </div>
                    </div>

                    <div className="permit-foot">
                      <div>
                        <div className="text-xs text-[#5B6660]">
                          Confirmed pursuant to Municipal Ordinance No. 1995-05.
                        </div>
                        <div className="text-xs text-[#5B6660]">
                          Action Date: {formatTimestamp(statusResult.legislatorActionAt || statusResult.updatedAt)}
                        </div>
                      </div>
                      <div className="sig-line">
                        <strong>{statusResult.legislatorName || 'Authorized Legislator'}</strong>
                        <div className="text-xs text-[#5B6660]">
                          Sangguniang Bayan / Tricycle Franchising Board
                        </div>
                      </div>
                    </div>

                    <div className="permit-disclaimer">
                      Present this official permit summary along with original LTO OR/CR and official
                      treasury receipt at the Office of the Sangguniang Bayan for physical MTOP sticker
                      issuance.
                    </div>

                    <div className="mt-4 no-print">
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => window.print()}
                      >
                        Print Official Permit Summary
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LEGISLATOR / STAFF DASHBOARD */}
        {activeTab === 'dashboard' && role === 'staff' && (
          <div className="view active">
            <div className="panel">
              <div className="panel-title">Legislator / Staff Dashboard</div>
              <div className="panel-note">
                Shared view—visible to authorized Sangguniang Bayan staff and legislators. Automated
                checks produce a recommendation only; no status changes until a named legislator
                confirms a decision.
              </div>

              {dashboardError && (
                <div className="alert-banner warning">
                  <span>{dashboardError}</span>
                  <button
                    type="button"
                    className="btn outline sm"
                    onClick={() => loadDashboardApps(true)}
                  >
                    Retry Sync
                  </button>
                </div>
              )}

              <div className="stats-row">
                <div className="stat">
                  <div className="num">{stats.total}</div>
                  <div className="lbl">Total Apps</div>
                </div>
                <div className="stat">
                  <div className="num">{stats.awaiting}</div>
                  <div className="lbl">Awaiting</div>
                </div>
                <div className="stat">
                  <div className="num">{stats.approved}</div>
                  <div className="lbl">Approved</div>
                </div>
                <div className="stat">
                  <div className="num">{stats.denied}</div>
                  <div className="lbl">Denied</div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <input
                  type="text"
                  className="px-3 py-2 border border-[#B8BFB8] rounded-[3px] text-sm w-full md:w-72 bg-white"
                  placeholder="Search Ref No., Applicant, Plate…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />

                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { key: 'all', label: 'All' },
                      { key: 'awaiting_confirmation', label: 'Awaiting' },
                      { key: 'confirmed_approved', label: 'Approved' },
                      { key: 'confirmed_denied', label: 'Denied' },
                      { key: 'returned', label: 'Returned' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className={`btn sm ${statusFilter === tab.key ? '' : 'outline'}`}
                      onClick={() => setStatusFilter(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* View Toggle & Sangguniang Bayan E-TALA Sync Bar */}
              <div className="mb-4 p-3 bg-[#FAFBF9] border border-[#D8D9D6] rounded-[3px] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`btn sm ${dashboardView === 'queue' ? '' : 'outline'}`}
                    onClick={() => setDashboardView('queue')}
                  >
                    Legislator Review Queue
                  </button>
                  <button
                    type="button"
                    className={`btn sm ${dashboardView === 'etala' ? '' : 'outline'}`}
                    onClick={() => setDashboardView('etala')}
                  >
                    Tricycle Franchising Menu Table (SB Sync)
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn outline sm"
                    disabled={filteredApplications.length === 0}
                    onClick={() => {
                      const rows = filteredApplications.map((app) =>
                        toSangguniangBayanTableRow(app)
                      );
                      handleCopyText(
                        JSON.stringify(rows, null, 2),
                        'etala-bulk-json',
                        `Copied ${rows.length} Tricycle Franchising Menu Table record(s) in sangguniangbayanesp.ai.studio JSON format.`
                      );
                    }}
                  >
                    {copiedKey === 'etala-bulk-json'
                      ? 'Copied SB Table JSON!'
                      : 'Copy SB Table JSON'}
                  </button>

                  <button
                    type="button"
                    className="btn outline sm"
                    disabled={filteredApplications.length === 0}
                    onClick={() => {
                      const rows = filteredApplications.map((app) =>
                        toSangguniangBayanTableRow(app)
                      );
                      const headers = [
                        'Franchise No.',
                        'Body No.',
                        'Operator Name',
                        'Driver Name',
                        'Route / TODA',
                        'Chassis / Engine & Plate',
                        'Date Applied',
                        'Date Approved',
                        'Expiry Date',
                        'Franchise Status',
                        'Inspection Status',
                        'Remarks',
                      ];
                      const escapeCsv = (v: string) =>
                        `"${String(v ?? '').replace(/"/g, '""')}"`;
                      const csvLines = [
                        headers.join(','),
                        ...rows.map((r) =>
                          [
                            r.franchiseNo,
                            r.bodyNumber,
                            r.operatorName,
                            r.driverName,
                            r.routeTODA,
                            r.chassisEngineNo,
                            r.dateApplied,
                            r.dateApproved,
                            r.expiryDate,
                            r.franchiseStatus,
                            r.inspectionStatus,
                            r.remarks,
                          ]
                            .map(escapeCsv)
                            .join(',')
                        ),
                      ];
                      const blob = new Blob([csvLines.join('\n')], {
                        type: 'text/csv;charset=utf-8;',
                      });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `tricycle_franchising_menu_table_${new Date()
                        .toISOString()
                        .slice(0, 10)}.csv`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export CSV
                  </button>

                  <a
                    href="https://sangguniangbayanesp.ai.studio"
                    target="_blank"
                    rel="noreferrer"
                    className="btn gold sm"
                  >
                    Open sangguniangbayanesp.ai.studio
                  </a>
                </div>
              </div>

              {isLoadingDashboard ? (
                <div className="empty-state">Loading applications…</div>
              ) : filteredApplications.length === 0 ? (
                <div className="empty-state">
                  No franchise applications match your current filter.
                </div>
              ) : dashboardView === 'queue' ? (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Ref No.</th>
                        <th>Applicant</th>
                        <th>TODA / Route</th>
                        <th>Plate No.</th>
                        <th>Type</th>
                        <th>Recommendation</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApplications.map((app) => (
                        <tr key={app.id || app.refNo}>
                          <td className="tabular font-semibold">{app.refNo}</td>
                          <td>{app.applicantName}</td>
                          <td>{app.todaRoute || app.todaName || '—'}</td>
                          <td className="tabular">{app.vehiclePlate}</td>
                          <td className="uppercase text-xs">{app.applicationType}</td>
                          <td>
                            <span className={getRecommendationBadgeClass(app.aiResult?.decision)}>
                              {(app.aiResult?.decision || 'pending').toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <span className={getStatusBadgeClass(app.status)}>
                              {formatStatusLabel(app.status)}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn outline sm"
                              onClick={() => {
                                setSelectedApp(app);
                                setLegislatorName(app.legislatorName || '');
                                setLegislatorRemarks(app.legislatorRemarks || '');
                              }}
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div>
                  <div className="notice-banner text-xs mb-3">
                    <strong>Sangguniang Bayan Tricycle Franchising Menu Table Format:</strong> Rows
                    below are mapped directly to the schema used by{' '}
                    <span className="tabular">https://sangguniangbayanesp.ai.studio</span>{' '}
                    (Tricycle Franchising menu). Because{' '}
                    <span className="tabular">sangguniangbayanesp.ai.studio</span> is hosted on a
                    separate origin without an inbound API endpoint, use{' '}
                    <strong>Copy SB Table JSON</strong> or <strong>Export CSV</strong> to transfer
                    or import records into that portal.
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Franchise / Ref No.</th>
                          <th>Body No.</th>
                          <th>Operator / Driver</th>
                          <th>Route / TODA</th>
                          <th>Chassis / Engine &amp; Plate</th>
                          <th>Date Applied</th>
                          <th>Franchise Status</th>
                          <th>Inspection</th>
                          <th>Sync</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredApplications.map((app) => {
                          const row = toSangguniangBayanTableRow(app);
                          return (
                            <tr key={app.id || app.refNo}>
                              <td className="tabular font-semibold">{row.franchiseNo}</td>
                              <td className="tabular">{row.bodyNumber}</td>
                              <td>{row.operatorName}</td>
                              <td>{row.routeTODA}</td>
                              <td className="tabular text-xs">{row.chassisEngineNo}</td>
                              <td className="tabular">{row.dateApplied}</td>
                              <td>
                                <span className={getStatusBadgeClass(app.status)}>
                                  {row.franchiseStatus}
                                </span>
                              </td>
                              <td>{row.inspectionStatus}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn outline sm"
                                  onClick={() =>
                                    handleCopyText(
                                      JSON.stringify(row, null, 2),
                                      `row-${app.refNo}`,
                                      `Copied ${row.franchiseNo} row JSON for sangguniangbayanesp.ai.studio.`
                                    )
                                  }
                                >
                                  {copiedKey === `row-${app.refNo}` ? 'Copied' : 'Copy Row'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* DETAIL & LEGISLATOR CONFIRMATION PANEL */}
              {selectedApp && (
                <div className="detail">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-[#D8D9D6]">
                    <div>
                      <div className="text-xs text-[#5B6660] uppercase">Application Review</div>
                      <h3
                        className="text-lg font-bold text-[#0e7c53] tabular"
                        style={{ fontFamily: 'var(--serif)' }}
                      >
                        {selectedApp.refNo} — {selectedApp.applicantName}
                      </h3>
                    </div>
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={() => setSelectedApp(null)}
                    >
                      Close Review
                    </button>
                  </div>

                  <div className="detail-grid">
                    <div>
                      <div className="detail-item-label">Application Type</div>
                      <div className="detail-item-val uppercase">{selectedApp.applicationType}</div>
                    </div>
                    <div>
                      <div className="detail-item-label">Contact Number</div>
                      <div className="detail-item-val tabular">{selectedApp.contactNumber}</div>
                    </div>
                    <div>
                      <div className="detail-item-label">Address</div>
                      <div className="detail-item-val">{selectedApp.applicantAddress}</div>
                    </div>
                    <div>
                      <div className="detail-item-label">Plate / Body / Engine</div>
                      <div className="detail-item-val tabular">
                        {selectedApp.vehiclePlate} · {selectedApp.bodyNumber || '—'} ·{' '}
                        {selectedApp.engineNumber || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="detail-item-label">LTO CR / OR</div>
                      <div className="detail-item-val tabular">
                        {selectedApp.ltoCrNumber || '—'} / {selectedApp.ltoOrNumber || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="detail-item-label">Driver&apos;s License &amp; Expiry</div>
                      <div className="detail-item-val tabular">
                        {selectedApp.licenseNumber} (exp: {selectedApp.licenseExpiry})
                      </div>
                    </div>
                    <div>
                      <div className="detail-item-label">TODA &amp; Route</div>
                      <div className="detail-item-val">
                        {selectedApp.todaName || '—'} — {selectedApp.todaRoute}
                      </div>
                    </div>
                    <div>
                      <div className="detail-item-label">Submitted</div>
                      <div className="detail-item-val">{formatTimestamp(selectedApp.submittedAt)}</div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="detail-item-label mb-2">Submitted Attachments Checklist</div>
                    <div className="flex flex-wrap gap-2">
                      {ATTACHMENT_LABELS.map((item) => {
                        const checked = selectedApp.attachments?.[item.key];
                        return (
                          <span
                            key={item.key}
                            className={`badge ${checked ? 'approve' : 'pending'}`}
                          >
                            {checked ? '✓' : '✗'} {item.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {selectedApp.aiResult && (
                    <div className="confirm-box mb-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <strong className="text-sm text-[#0e7c53]">
                          Automated Pre-Check Recommendation
                        </strong>
                        <span className={getRecommendationBadgeClass(selectedApp.aiResult.decision)}>
                          {selectedApp.aiResult.decision.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm mb-2">{selectedApp.aiResult.summary}</p>
                      <ul className="list-disc pl-5 text-xs text-[#5B6660] space-y-1">
                        {selectedApp.aiResult.reasons?.map((reason, idx) => (
                          <li key={idx}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedApp.driveFolderUrl && (
                    <div className="mb-4">
                      <a
                        href={selectedApp.driveFolderUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn outline sm"
                      >
                        Open Google Drive &ldquo;franchising&rdquo; Folder
                      </a>
                    </div>
                  )}

                  <div className="confirm-box">
                    <h4
                      className="text-base font-bold text-[#0e7c53] mb-3"
                      style={{ fontFamily: 'var(--serif)' }}
                    >
                      Legislator / Sangguniang Bayan Confirmation
                    </h4>
                    <div className="grid">
                      <div className="field">
                        <label htmlFor="legislator-name">Confirming Legislator Name</label>
                        <input
                          id="legislator-name"
                          type="text"
                          placeholder="Hon. Sangguniang Bayan Member"
                          value={legislatorName}
                          onChange={(e) => setLegislatorName(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="legislator-remarks">Remarks / Board Resolution Note</label>
                        <input
                          id="legislator-remarks"
                          type="text"
                          placeholder="Optional remarks or deficiencies noted"
                          value={legislatorRemarks}
                          onChange={(e) => setLegislatorRemarks(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="action-row">
                      <button
                        type="button"
                        className="btn"
                        disabled={isUpdatingDecision}
                        onClick={() => handleLegislatorDecision('confirmed_approved')}
                      >
                        Confirm Approval
                      </button>
                      <button
                        type="button"
                        className="btn red"
                        disabled={isUpdatingDecision}
                        onClick={() => handleLegislatorDecision('confirmed_denied')}
                      >
                        Confirm Denial
                      </button>
                      <button
                        type="button"
                        className="btn gold"
                        disabled={isUpdatingDecision}
                        onClick={() => handleLegislatorDecision('returned')}
                      >
                        Return for Correction
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
