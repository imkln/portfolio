import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import Header from './header/Header';
import Collection from './collections/Collection';
import Home from './home/Home';
import Photos from './photos/Photos';

export default function App() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [path, setPath] = useState(window.location.pathname);
  const collectionId = /^\/collections\/([a-z0-9-]+)\/?$/.exec(path)?.[1];

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function loadSession() {
      try {
        const response = await fetch('/api/session', { signal });
        if (!signal.aborted && (response.ok || response.status === 401)) {
          setSignedIn(response.ok);
        }
      } catch {
        // The session is unknown, so leave the account controls hidden.
      }
    }

    void loadSession();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function goBackOrForward() {
      setPath(window.location.pathname);
    }

    window.addEventListener('popstate', goBackOrForward);
    return () => window.removeEventListener('popstate', goBackOrForward);
  }, []);

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;

    event.preventDefault();
    const destination = event.currentTarget.pathname;
    window.history.pushState(null, '', destination);
    setPath(destination);
    window.scrollTo(0, 0);
  }

  return (
    <>
      <Header path={path} signedIn={signedIn} onNavigate={navigate} />
      <div className="frame">
        {path === '/photos' ? (
          signedIn === true ? (
            <Photos />
          ) : (
            <main className="photos-page">
              {signedIn === false ? (
                <p>Sign in to view photos.</p>
              ) : (
                <p role="status">Checking session…</p>
              )}
            </main>
          )
        ) : collectionId ? (
          <Collection
            key={collectionId}
            id={collectionId}
            canEdit={signedIn === true}
          />
        ) : (
          <Home canEdit={signedIn === true} onOpen={navigate} />
        )}
      </div>
    </>
  );
}
