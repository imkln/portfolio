import { sampleCovers } from '../../data/sampleCovers';

export default function Cover({ photoId }: { photoId: string | null }) {
  const src = photoId && sampleCovers[photoId];

  return src ? (
    <img className="cover-photo" src={src} alt="" draggable={false} />
  ) : (
    <span className="cover-empty">No cover photo</span>
  );
}
