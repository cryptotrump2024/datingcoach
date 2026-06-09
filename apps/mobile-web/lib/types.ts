export type Tier = 'free' | 'pro' | 'advanced';

export interface Profile {
  id: string;
  display_name: string | null;
  tier: Tier;
  created_at: string;
}

export interface UsageCredits {
  user_id: string;
  period_start: string;
  messages_used: number;
}

export const TIER_LIMITS: Record<Tier, number | null> = {
  free: 15,
  pro: 500,
  advanced: null, // unlimited
};

export interface Persona {
  id: string;
  user_id: string;
  name: string;
  difficulty: number; // 1-10
  ethnicity: string;
  personality_archetype: string;
  characteristics: PersonaCharacteristics;
  image_url: string | null;
  created_at: string;
}

export interface PersonaCharacteristics {
  age: number;
  occupation: string;
  interests: string[];
  attachment_style: 'secure' | 'anxious' | 'avoidant';
  texting_style: 'dry' | 'playful' | 'flirty' | 'intellectual' | 'chaotic';
  extra?: string;
}

export type ConversationStatus = 'active' | 'ghosted' | 'ended' | 'number_given';

export interface Conversation {
  id: string;
  user_id: string;
  persona_id: string;
  mode: 'dating_app';
  interest_level: number; // 0-100, hidden persona state
  status: ConversationStatus;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface MessageFeedback {
  message_id: string;
  feedback: CoachingFeedback;
}

export interface CoachingFeedback {
  message_score: number; // 1-10
  what_worked: string;
  what_hurt: string;
  invisible_context_decode: string; // what HER message really communicates
  what_she_really_means: string;
  suggested_better_message: string;
  tip: string;
  interest_level: number;
}

export interface ConversationRating {
  conversation_id: string;
  overall_score: number; // 1-100
  categories: CategoryScore[];
  top_improvements: string[];
  psychology_insight: string;
  summary: string;
}

export interface CategoryScore {
  category: string;
  score: number; // 1-10
  advice: string;
}

export interface ProfileAnalysis {
  what_it_communicates: string;
  personality_read: string;
  conversation_hooks: string[];
  suggested_openers: string[];
  red_flags_or_cautions: string;
}

export const ETHNICITIES = [
  'White / Caucasian',
  'Latina',
  'Black',
  'East Asian',
  'South Asian',
  'Middle Eastern',
  'Mixed',
  'Southeast Asian',
  'Eastern European',
] as const;

export const ARCHETYPES = [
  { key: 'sweetheart', label: 'Sweetheart', blurb: 'Warm, open, rewards sincerity' },
  { key: 'sassy', label: 'Sassy & Witty', blurb: 'Teases hard, expects banter' },
  { key: 'intellectual', label: 'Intellectual', blurb: 'Deep talk, allergic to small talk' },
  { key: 'adventurous', label: 'Adventurer', blurb: 'Spontaneous, hates boring openers' },
  { key: 'reserved', label: 'Reserved', blurb: 'Slow to warm, needs patience' },
  { key: 'party', label: 'Party Girl', blurb: 'High energy, short attention span' },
  { key: 'ambitious', label: 'Boss Energy', blurb: 'Career-driven, tests confidence' },
  { key: 'artsy', label: 'Creative Soul', blurb: 'Emotional depth, values originality' },
] as const;
