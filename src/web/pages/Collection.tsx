import Cover from '../components/Collection/Cover';
import type { Collection as CollectionData } from '../data/Collection';
import './Collection.css';

export default function Collection({
  collection,
}: {
  collection: CollectionData;
}) {
  return (
    <main className="collection-page">
      <h1>{collection.title || 'Untitled collection'}</h1>
      <p className="collection-metadata">{collection.metadata}</p>
      <Cover
        photoId={collection.coverPhotoId}
        photoUrl={collection.coverPhotoUrl}
      />
    </main>
  );
}
