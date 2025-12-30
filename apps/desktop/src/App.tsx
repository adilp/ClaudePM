import { useState, useEffect } from 'react';

function App() {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  useEffect(() => {
    // Placeholder: Will connect to backend in future tickets
    const timer = setTimeout(() => {
      setStatus('connecting');
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="app">
      <div className="container">
        <div className="logo">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 className="title">Claude PM</h1>
        <div className="status">
          {status === 'connecting' && (
            <>
              <div className="spinner" />
              <span>Connecting...</span>
            </>
          )}
          {status === 'connected' && (
            <span className="connected">Connected</span>
          )}
          {status === 'error' && (
            <span className="error">Connection failed</span>
          )}
        </div>
        <p className="hint">
          Configure your server connection in Settings
        </p>
      </div>
    </div>
  );
}

export default App;
