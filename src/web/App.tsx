import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Collection as CollectionData } from './data/Collection';
import Collection from './pages/Collection';
import Home from './pages/Home';

export default function App() {
  const [collections, setCollections] = useState<
    CollectionData[] | 'loading' | 'error'
  >('loading');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [path, setPath] = useState(window.location.pathname);
  const collection = Array.isArray(collections)
    ? collections.find(({ id }) => path === `/collections/${id}`)
    : undefined;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function loadCollections() {
      try {
        const response = await fetch('/api/collections', { signal });
        if (!response.ok) throw new Error('Could not load collections');

        const data: { collections: CollectionData[] } = await response.json();
        if (!Array.isArray(data.collections))
          throw new Error('Invalid collections response');

        if (!signal.aborted) setCollections(data.collections);
      } catch {
        if (!signal.aborted) setCollections('error');
      }
    }

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

    void loadCollections();
    void loadSession();
    return () => controller.abort();
  }, []);

  async function saveCollections(updated: CollectionData[]) {
    const response = await fetch('/api/collections', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collections: updated }),
    });
    if (!response.ok) throw new Error('Could not save collections');

    setCollections(updated);
  }

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
    <div className="frame">
      <header className="mast">
        <a href="/" onClick={navigate}>
          portfolio
        </a>
        {signedIn === false && (
          <a className="sign-in" href="/auth/login">
            Sign in
          </a>
        )}
        {signedIn === true && (
          <form action="/auth/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        )}
      </header>
      {collection ? (
        <Collection collection={collection} />
      ) : (
        <Home
          collections={collections}
          canEdit={signedIn === true}
          onSave={saveCollections}
          onOpen={navigate}
        />
      )}
    </div>
  );
}
