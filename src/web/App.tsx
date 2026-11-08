import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { sampleCollections } from './data/sampleCollections';
import Collection from './pages/Collection';
import Home from './pages/Home';

export default function App() {
  const [collections, setCollections] = useState(sampleCollections);
  const [path, setPath] = useState(window.location.pathname);
  const collection = collections.find(
    ({ id }) => path === `/collections/${id}`,
  );

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
      </header>
      {collection ? (
        <Collection collection={collection} />
      ) : (
        <Home
          collections={collections}
          onSave={setCollections}
          onOpen={navigate}
        />
      )}
    </div>
  );
}
