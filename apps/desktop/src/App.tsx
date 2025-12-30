import { SessionList } from './components/SessionList';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <svg
            width="32"
            height="32"
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
        <h1 className="app-title">Claude PM</h1>
      </header>

      <main className="app-main">
        <SessionList />
      </main>
    </div>
  );
}

export default App;
