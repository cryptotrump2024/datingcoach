import { supabase, FUNCTIONS_URL } from './supabase';
import {
  CoachingFeedback,
  ConversationRating,
  ConversationStatus,
  Persona,
  ProfileAnalysis,
} from './types';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function callFn<T>(name: string, body: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      message = JSON.parse(text).error ?? text;
    } catch {
      // non-JSON error body, keep raw text
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ChatResult {
  reply: string | null; // null when she leaves you on read
  interest_level: number;
  status: ConversationStatus;
  user_message_id: string;
  assistant_message_id: string | null;
}

/**
 * Sends a user message. Streams the persona's reply token-by-token via SSE
 * when the runtime supports streaming fetch bodies (web); otherwise falls
 * back to a single buffered response.
 */
export async function sendChatMessage(
  conversationId: string,
  content: string,
  onToken: (partial: string) => void
): Promise<ChatResult> {
  const headers = await authHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/chat`, {
    method: 'POST',
    headers: { ...headers, Accept: 'text/event-stream' },
    body: JSON.stringify({ conversation_id: conversationId, content }),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      message = JSON.parse(text).error ?? text;
    } catch {
      // keep raw text
    }
    throw new ApiError(res.status, message);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream') || !res.body) {
    return (await res.json()) as ChatResult;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let result: ChatResult | null = null;

  // SSE frames: "event: token\ndata: {...}\n\n" / "event: done\ndata: {...}\n\n"
  const processFrame = (frame: string) => {
    const lines = frame.split('\n');
    let event = 'message';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return;
    if (event === 'token') {
      accumulated += JSON.parse(data).text as string;
      onToken(accumulated);
    } else if (event === 'done') {
      result = JSON.parse(data) as ChatResult;
    } else if (event === 'error') {
      throw new ApiError(500, JSON.parse(data).error ?? 'Chat failed');
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      processFrame(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
    }
  }
  if (buffer.trim()) processFrame(buffer);

  if (!result) throw new ApiError(500, 'Stream ended without result');
  return result;
}

export async function getCoaching(
  conversationId: string,
  userMessageId: string
): Promise<CoachingFeedback> {
  return callFn<CoachingFeedback>('coach', {
    conversation_id: conversationId,
    user_message_id: userMessageId,
  });
}

export async function rateConversation(
  conversationId: string
): Promise<ConversationRating> {
  return callFn<ConversationRating>('rate-conversation', {
    conversation_id: conversationId,
  });
}

export async function generatePersonaImage(personaId: string): Promise<Persona> {
  return callFn<Persona>('generate-persona-image', { persona_id: personaId });
}

export async function analyzeProfileImage(
  base64: string,
  mediaType: string
): Promise<ProfileAnalysis> {
  return callFn<ProfileAnalysis>('analyze-profile-image', {
    image_base64: base64,
    media_type: mediaType,
  });
}

export type CryptoPeriod = 1 | 3 | 12;

export async function createCheckout(params: {
  provider: 'stripe' | 'crypto';
  tier: 'pro' | 'advanced';
  months?: CryptoPeriod; // crypto prepaid passes only
  pay_currency?: string; // usdttrc20 | usdc | btc
}): Promise<{ url: string }> {
  return callFn<{ url: string }>('create-checkout', params);
}

export async function openBillingPortal(): Promise<{ url: string }> {
  return callFn<{ url: string }>('create-checkout', { provider: 'portal' });
}
