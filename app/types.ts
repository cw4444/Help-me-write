export type Provider = "openai" | "anthropic";

export type Mode = "collaborate" | "edit";

export type Character = {
  id: string;
  name: string;
  role: string;
  age?: string;
  voice?: string;
  voiceExamples?: string;
  voiceSamples?: string[];
  goals?: string;
  limits?: string;
  quirks?: string;
  appearance?: string;
  relationships?: string;
  links?: Array<{ targetId: string; label: string }>;
  backstory?: string;
  timeline?: string;
  secrets?: string;
  notes?: string;
  facts: string[];
  contradictions: string[];
  memory?: string;
  updatedAt: number;
};

export type Settings = {
  provider: Provider;
  apiKey: string;
  model: string;
  writerName: string;
  tone: string;
  houseStyle: string;
  spice: number;
};
