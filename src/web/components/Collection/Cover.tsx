import { useState } from 'react';

export default function Cover({ photoId, thumbnail }: {
  photoId: string | null;
  thumbnail?: string;
}) {
  const [failedThumbnail, setFailedThumbnail] = useState<string>();

  if (thumbnail && thumbnail !== failedThumbnail) {
    return (
      <img
        className="cover-image"
        src={thumbnail}
        alt="Collection cover"
        draggable={false}
        onError={() => setFailedThumbnail(thumbnail)}
      />
    );
  }

  return (
    <span className="cover-empty">
      {photoId ? 'Cover photo unavailable' : 'No cover photo'}
    </span>
  );
}
