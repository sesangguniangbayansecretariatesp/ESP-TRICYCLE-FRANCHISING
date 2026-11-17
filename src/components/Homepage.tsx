import React, { useState } from 'react';

interface HomepageProps {
  onEnterPortal: (role: 'applicant' | 'staff') => void;
}

export default function Homepage({ onEnterPortal }: HomepageProps) {
  const [applicantType, setApplicantType] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleTypeSelect = (value: string) => {
    setApplicantType(value);
    setErrorMessage(null);
  };

  const handleEnter = () => {
    setErrorMessage(null);
    if (applicantType === 'applicant') {
      onEnterPortal('applicant');
    } else if (applicantType === 'staff') {
      setShowLogin(true);
    } else {
      setErrorMessage('Please select your portal role first.');
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (username.trim() === 'admin' && password === 'admin123') {
      onEnterPortal('staff');
    } else {
      setErrorMessage('Invalid username or password.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9F7] px-4 py-10 flex flex-col items-center justify-center">
      <div className="w-full max-w-md bg-white border border-[#D8D9D6] rounded-[3px] shadow-sm p-8">
        <div className="text-center mb-7">
          <div
            className="mx-auto mb-4 flex items-center justify-center rounded-full border-2 border-[#e2b00a] bg-[#0e7c53] text-[#e2b00a] font-bold text-center leading-tight"
            style={{ width: '76px', height: '76px', fontSize: '15px', fontFamily: 'var(--serif)' }}
          >
            LGU
            <br />
            ESP
          </div>
          <h1
            className="text-2xl font-bold text-[#0e7c53] mb-1"
            style={{ fontFamily: 'var(--serif)' }}
          >
            Tricycle Franchise Application
          </h1>
          <p className="text-xs text-[#5B6660]">
            Municipality of Sofronio Española · Office of the Sangguniang Bayan · Ordinance No. 1995-05
          </p>
        </div>

        {errorMessage && (
          <div className="alert-banner error mb-4" role="alert">
            <span>{errorMessage}</span>
          </div>
        )}

        {!showLogin ? (
          <div className="flex flex-col gap-4">
            <div className="field">
              <label htmlFor="portal-type-select">Portal Type</label>
              <select
                id="portal-type-select"
                value={applicantType}
                onChange={(e) => handleTypeSelect(e.target.value)}
              >
                <option value="">Select Application Type…</option>
                <option value="applicant">Applicant</option>
                <option value="staff">Tricycle Franchising Staff / Legislators</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleEnter}
              disabled={!applicantType}
              className="btn w-full py-3"
            >
              {applicantType === 'staff' ? 'Proceed to Staff Login' : 'Enter Portal'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#D8D9D6] pb-2">
              <h2 className="text-lg font-bold text-[#0e7c53]" style={{ fontFamily: 'var(--serif)' }}>
                Staff / Legislator Login
              </h2>
              <button
                type="button"
                className="btn outline sm"
                onClick={() => {
                  setShowLogin(false);
                  setErrorMessage(null);
                }}
              >
                Back
              </button>
            </div>

            <div className="field">
              <label htmlFor="staff-username">Username</label>
              <input
                id="staff-username"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="staff-password">Password</label>
              <input
                id="staff-password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn w-full py-3">
              Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
