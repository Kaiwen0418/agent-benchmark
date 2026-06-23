export type Note = {
  id: string;
  title: string;
  body: string;
  tag: string;
  createdAt: string;
};

export type AppSessionState = {
  notes: Note[];
};
