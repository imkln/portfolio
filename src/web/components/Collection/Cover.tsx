export default function Cover({ photoId }: { photoId: string | null }) {
  return (
    <span className="cover-empty">
      {photoId ? 'Cover photo unavailable' : 'No cover photo'}
    </span>
  );
}
