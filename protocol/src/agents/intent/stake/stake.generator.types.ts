export interface StakeGeneratorInput {
  initiator: string;
  target: string;
  targetIntro: string;
  isThirdPerson?: boolean;
  intentPairs: {
    contextUserIntent: {
      id: string;
      payload: string;
      createdAt: Date | string;
    };
    targetUserIntent: {
      id: string;
      payload: string;
      createdAt: Date | string;
    };
  }[];
  characterLimit?: number;
}

export interface StakeGeneratorResult {
  subject: string;
  body: string;
}
