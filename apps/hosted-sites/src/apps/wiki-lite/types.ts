export type WikiArticle = {
  slug: string;
  title: string;
  summary: string;
  body: string;
};

export type WikiAnswerSubmission = {
  answer: string;
  submittedAt: string;
};

export type AppSessionState = {
  wikiArticles: WikiArticle[];
  wikiAnswerSubmissions: WikiAnswerSubmission[];
};
