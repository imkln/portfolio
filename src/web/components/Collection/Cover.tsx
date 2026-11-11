import { useState } from 'react';

export default function Cover({ photoId, photoUrl }: {
  photoId: string | null;
  photoUrl?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();

  if (photoUrl && photoUrl !== failedUrl) {
    return (
      <img
        className="cover-image"
        src={photoUrl}
        alt="Collection cover"
        draggable={false}
        onError={() => setFailedUrl(photoUrl)}
      />
    );
  }

  return (
    <span className="cover-empty">
      {photoId ? 'Cover photo unavailable' : 'No cover photo'}
    </span>
  );
}
