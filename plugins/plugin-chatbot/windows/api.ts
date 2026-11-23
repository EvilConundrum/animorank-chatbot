import z from 'zod';

const BASE = '/plugin-api/chatbot';

/** One turn of the conversation, as the route expects it. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  sessionId: string;
  messages: ChatTurn[];
  code?: string;
  language?: string;
}

const answerSchema = z.object({
  reply: z.string(),
  model: z.string(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number()
  })
});

export type ChatAnswer = z.infer<typeof answerSchema>;

/** Ask the plugin for one reply. Throws the server's sentence when it refuses. */
export async function sendChat(request: ChatRequest): Promise<ChatAnswer> {
  const response = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request)
  });

  const data = await response.json().catch(() => ({ error: `${response.status} ${response.statusText}` }));
  if (!response.ok) throw new Error(data.error ?? `${response.status} ${response.statusText}`);
  return answerSchema.parse(data);
}
