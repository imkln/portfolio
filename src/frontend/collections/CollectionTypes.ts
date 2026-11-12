export type BoardLayout = {
  id: string;
  x: number;
  y: number;
  width: number;
};

export type TextLayout = Omit<BoardLayout, 'id'>;

type TextStyle = {
  largeText?: boolean;
  lightText?: boolean;
};

type CoverPhoto = {
  coverPhotoId: string | null;
  coverPhotoUrl?: string;
};

export type Collection = BoardLayout & CoverPhoto & TextStyle & {
  kind?: never;
  title: string;
  metadata: string;
  textLayout?: TextLayout;
};

type CanvasPhoto = BoardLayout & CoverPhoto & { kind: 'photo' };
type CanvasCaption = BoardLayout & TextStyle & {
  kind: 'caption';
  text: string;
  height: number;
};

export type CanvasItem = CanvasPhoto | CanvasCaption;
export type BoardItem = Collection | CanvasItem;
export type BoardItemChange = Partial<Omit<BoardLayout, 'id'> & CoverPhoto & TextStyle & {
  title: string;
  metadata: string;
  textLayout: TextLayout;
  text: string;
  height: number;
}>;

export type CollectionDetail = Collection & { items: CanvasItem[] };
