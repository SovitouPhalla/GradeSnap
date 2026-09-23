export type QuestionType = "mcq" | "short_answer";

export type QuestionDraft = {
  orderIndex: number;
  prompt: string;
  type: QuestionType;
  correctOption: string;
  rubric: string;
  maxPoints: number;
};

export type QuestionRecord = {
  id: string;
  order_index: number;
  prompt: string;
  type: QuestionType;
  correct_option: string | null;
  rubric: string | null;
  max_points: number;
};

export type OCRMappedAnswer = {
  questionNumber: number;
  response: string;
};

export type OCRResult = {
  studentName: string | null;
  rawText: string;
  answers: OCRMappedAnswer[];
};

export type GradeSuggestion = {
  questionId: string;
  questionNumber: number;
  score: number;
  confidence: "high" | "low";
  note: string;
  autoAccepted: boolean;
  needsReview: boolean;
  studentResponse: string;
  questionType: QuestionType;
  maxPoints: number;
};
