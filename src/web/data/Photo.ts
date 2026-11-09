export type PhotoDetails = {
  id: string;
  name: string;
  uploadedAt: string;
};

export type Photo = PhotoDetails & {
  thumbnail: string;
  original: string;
};
