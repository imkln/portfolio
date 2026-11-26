// HTTP fixture data stays usable with a replacement frontend.
type Layout = { id: string; x: number; y: number; width: number };
type TextStyle = { largeText?: boolean; lightText?: boolean };
type Cover = { coverPhotoId: string | null; coverPhotoUrl?: string };

export type Collection = Layout &
  Cover &
  TextStyle & {
    title: string;
    metadata: string;
    textLayout?: Omit<Layout, 'id'>;
  };

export type CanvasItem =
  | (Layout & Cover & { kind: 'photo' })
  | (Layout & TextStyle & { kind: 'caption'; text: string; height: number });

export type Photo = {
  id: string;
  name: string;
  uploadedAt: string;
  tagIds?: string[];
  thumbnail: string;
  original: string;
};

export type Tag = { id: string; name: string; parentId?: string };
