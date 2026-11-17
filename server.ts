import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ApplicationRecord, ApplicationStatus } from './src/types/franchise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '.data');
const DATA_FILE = path.join(DATA_DIR, 'applications.json');

function ensureDataFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function readApplications(): ApplicationRecord[] {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ApplicationRecord[]) : [];
  } catch {
    return [];
  }
}

function writeApplications(apps: ApplicationRecord[]): void {
  ensureDataFile();
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(apps, null, 2), 'utf8');
  fs.renameSync(tmpFile, DATA_FILE);
}

function generateServerRefNo(): string {
  const year = new Date().getFullYear();
  const numPart = Math.floor(1000 + Math.random() * 9000);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const c1 = chars[Math.floor(Math.random() * chars.length)];
  const c2 = chars[Math.floor(Math.random() * chars.length)];
  return `SOF-ESP-TRC-${year}-${numPart}${c1}${c2}`;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  // List all applications (newest first), with optional ?refNo= filter
  app.get('/api/applications', (req, res) => {
    const refQuery = typeof req.query.refNo === 'string' ? req.query.refNo.trim().toUpperCase() : '';
    const apps = readApplications().sort((a, b) => {
      const aTime = new Date(String(a.submittedAt || 0)).getTime() || 0;
      const bTime = new Date(String(b.submittedAt || 0)).getTime() || 0;
      return bTime - aTime;
    });

    if (refQuery) {
      const filtered = apps.filter((item) => item.refNo.toUpperCase() === refQuery);
      return res.json({ applications: filtered });
    }

    return res.json({ applications: apps });
  });

  // Lookup a single application by auto-generated Reference Number
  app.get('/api/applications/lookup/:refNo', (req, res) => {
    const targetRef = String(req.params.refNo || '').trim().toUpperCase();
    if (!targetRef) {
      return res.status(400).json({ error: 'Reference number is required.' });
    }
    const apps = readApplications();
    const match = apps.find((item) => item.refNo.toUpperCase() === targetRef);
    if (!match) {
      return res.status(404).json({ error: `No application found for reference "${targetRef}".` });
    }
    return res.json({ application: match });
  });

  // Create new franchise application (saves directly to Legislator / Staff Dashboard storage)
  app.post('/api/applications', (req, res) => {
    const body = req.body as Partial<ApplicationRecord>;
    if (
      !body ||
      !body.applicantName?.trim() ||
      !body.contactNumber?.trim() ||
      !body.applicantAddress?.trim() ||
      !body.vehiclePlate?.trim() ||
      !body.licenseNumber?.trim() ||
      !body.licenseExpiry?.trim() ||
      !body.todaRoute?.trim()
    ) {
      return res.status(400).json({
        error: 'Please complete all required application fields.',
      });
    }

    const apps = readApplications();
    const nowIso = new Date().toISOString();
    let refNo =
      typeof body.refNo === 'string' && body.refNo.trim()
        ? body.refNo.trim().toUpperCase().slice(0, 40)
        : generateServerRefNo();

    while (apps.some((existing) => existing.refNo.toUpperCase() === refNo)) {
      refNo = generateServerRefNo();
    }

    const newRecord: ApplicationRecord = {
      id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      refNo,
      userId: typeof body.userId === 'string' && body.userId ? body.userId : 'portal-applicant',
      applicationType: body.applicationType === 'renewal' ? 'renewal' : 'new',
      applicantName: body.applicantName.trim().slice(0, 150),
      contactNumber: body.contactNumber.trim().slice(0, 40),
      applicantAddress: body.applicantAddress.trim().slice(0, 250),
      ctcNumber: String(body.ctcNumber || '').trim().slice(0, 60),
      citizenshipAttested: Boolean(body.citizenshipAttested),
      bodyNumber: String(body.bodyNumber || '').trim().slice(0, 50),
      engineNumber: String(body.engineNumber || '').trim().slice(0, 60),
      vehiclePlate: body.vehiclePlate.trim().toUpperCase().slice(0, 40),
      ltoCrNumber: String(body.ltoCrNumber || '').trim().slice(0, 60),
      ltoOrNumber: String(body.ltoOrNumber || '').trim().slice(0, 60),
      licenseNumber: body.licenseNumber.trim().slice(0, 60),
      licenseExpiry: body.licenseExpiry.trim().slice(0, 20),
      todaName: String(body.todaName || '').trim().slice(0, 120),
      todaRoute: body.todaRoute.trim().slice(0, 160),
      attachments: {
        license: Boolean(body.attachments?.license),
        cr: Boolean(body.attachments?.cr),
        citizenship: Boolean(body.attachments?.citizenship),
        ctc: Boolean(body.attachments?.ctc),
        brgy: Boolean(body.attachments?.brgy),
        toda: Boolean(body.attachments?.toda),
        fed: Boolean(body.attachments?.fed),
        insurance: Boolean(body.attachments?.insurance),
        medical: Boolean(body.attachments?.medical),
        affidavit: Boolean(body.attachments?.affidavit),
      },
      aiResult: body.aiResult || {
        decision: 'flag',
        summary: 'Submitted for Sangguniang Bayan review.',
        reasons: [],
      },
      status: 'awaiting_confirmation',
      submittedAt: nowIso,
      updatedAt: nowIso,
    };

    writeApplications([newRecord, ...apps]);
    return res.status(201).json({ application: newRecord });
  });

  // Update legislator decision
  app.patch('/api/applications/:id', (req, res) => {
    const idOrRef = String(req.params.id || '').trim();
    const { status, legislatorName, legislatorRemarks } = req.body as {
      status?: ApplicationStatus;
      legislatorName?: string;
      legislatorRemarks?: string;
    };

    const allowedStatuses: ApplicationStatus[] = [
      'awaiting_confirmation',
      'confirmed_approved',
      'confirmed_denied',
      'returned',
    ];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Valid decision status is required.' });
    }
    if (!legislatorName || !legislatorName.trim()) {
      return res.status(400).json({ error: 'Confirming legislator name is required.' });
    }

    const apps = readApplications();
    const idx = apps.findIndex(
      (item) => item.id === idOrRef || item.refNo.toUpperCase() === idOrRef.toUpperCase()
    );
    if (idx === -1) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    const nowIso = new Date().toISOString();
    const updated: ApplicationRecord = {
      ...apps[idx],
      status,
      legislatorName: legislatorName.trim().slice(0, 150),
      legislatorRemarks: String(legislatorRemarks || '').trim().slice(0, 500),
      legislatorActionAt: nowIso,
      updatedAt: nowIso,
    };
    apps[idx] = updated;
    writeApplications(apps);

    return res.json({ application: updated });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
