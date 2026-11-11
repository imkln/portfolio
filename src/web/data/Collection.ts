export type BoardLayout = {
  id: string;
  x: number;
  y: number;
  width: number;
};

type CoverPhoto = {
  coverPhotoId: string | null;
  coverPhotoUrl?: string;
};

export type Collection = BoardLayout & CoverPhoto & {
  kind?: never;
  title: string;
  metadata: string;
};

type CanvasPhoto = BoardLayout & CoverPhoto & { kind: 'photo' };
type CanvasCaption = BoardLayout & {
  kind: 'caption';
  text: string;
  height: number;
};

export type CanvasItem = CanvasPhoto | CanvasCaption;
export type BoardItem = Collection | CanvasItem;
export type BoardItemChange = Partial<Omit<BoardLayout, 'id'> & CoverPhoto & {
  title: string;
  metadata: string;
  text: string;
  height: number;
}>;

export type CollectionDetail = Collection & { items: CanvasItem[] };
