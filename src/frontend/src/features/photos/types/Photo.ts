export type PhotoDetails = {
  id: string;
  name: string;
  uploadedAt: string;
  tagIds?: string[];
};

export type Photo = PhotoDetails & {
  thumbnail: string;
  original: string;
};
