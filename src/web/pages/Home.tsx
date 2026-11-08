import type { MouseEvent } from 'react';
import CollectionBoard from '../components/CollectionBoard/CollectionBoard';
import type { Collection } from '../data/Collection';

type Props = {
  collections: Collection[] | 'loading' | 'error';
  canEdit: boolean;
  onSave: (collections: Collection[]) => Promise<void>;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export default function Home(props: Props) {
  const { collections, ...boardProps } = props;

  if (Array.isArray(collections)) {
    return <CollectionBoard collections={collections} {...boardProps} />;
  }

  return (
    <main>
      <div className="board-heading">
        <h1>Collections</h1>
      </div>
      {collections === 'error' ? (
        <p role="alert">Could not load collections.</p>
      ) : (
        <p role="status">Loading collections…</p>
      )}
    </main>
  );
}
