import React, { useState } from 'react';
import Homepage from './components/Homepage';
import TricyclePortal from './components/TricyclePortal';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class PortalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8F9F7] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#D8D9D6] rounded-[3px] p-6">
            <h2 className="text-lg font-bold text-[#8C2F2F] mb-2">Portal Error</h2>
            <p className="text-sm text-[#5B6660] mb-4">{this.state.message}</p>
            <button
              type="button"
              className="btn sm"
              onClick={() => this.setState({ hasError: false, message: '' })}
            >
              Reload Portal
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function getInitialRefFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    return ref ? ref.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

export default function App() {
  const initialRef = getInitialRefFromUrl();
  const [view, setView] = useState<'home' | 'portal'>(initialRef ? 'portal' : 'home');
  const [userRole, setUserRole] = useState<'applicant' | 'staff' | null>(
    initialRef ? 'applicant' : null
  );

  return (
    <PortalErrorBoundary>
      {view === 'home' ? (
        <Homepage
          onEnterPortal={(role) => {
            setUserRole(role);
            setView('portal');
          }}
        />
      ) : (
        <TricyclePortal
          role={userRole}
          initialLookupRef={initialRef}
          onExit={() => setView('home')}
        />
      )}
    </PortalErrorBoundary>
  );
}
