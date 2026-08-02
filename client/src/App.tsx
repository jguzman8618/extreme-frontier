import { useEffect, useRef, useState } from 'react';
import { authenticateWithDiscord, isInsideDiscord } from './discord';
import { mountWildwood } from './game/wildwood';
import './game/wildwood.css';

type Status = 'authenticating' | 'ready' | 'error';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inDiscord] = useState(() => isInsideDiscord());
  const [status, setStatus] = useState<Status>(inDiscord ? 'authenticating' : 'ready');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inDiscord) return;
    authenticateWithDiscord()
      .then(() => setStatus('ready'))
      .catch((err) => {
        console.error('Discord authentication failed', err);
        setError(err instanceof Error ? err.message : 'Discord authentication failed');
        setStatus('error');
      });
  }, [inDiscord]);

  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return;
    const dispose = mountWildwood(containerRef.current);
    return () => dispose();
  }, [status]);

  if (status === 'authenticating') {
    return (
      <div className="loading-screen">
        <h1>Extreme Frontier</h1>
        <p>Connecting to Discord…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="loading-screen">
        <h1>Extreme Frontier</h1>
        <p>Couldn't connect to Discord: {error}</p>
      </div>
    );
  }

  return <div ref={containerRef} className="game-root" />;
}
