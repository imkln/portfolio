export type Collection = {
  id: string;
  title: string;
  metadata: string;
  coverPhotoId: string | null;
  coverThumbnailUrl?: string;
  x: number;
  y: number;
  width: number;
};
