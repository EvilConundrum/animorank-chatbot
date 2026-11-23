/**
 * The provider seam: one call that turns a system prompt and a conversation into
 * a reply. Ported from `animorank-clive`'s CLive plugin
 * (`plugins/plugin-clive/server/providers/provider.ts`), which uses the same
 * shape for its JSON judge calls.
 *
 * `chat.ts` builds the context and never imports a vendor SDK. A provider takes
 * the system text, the conversation, the model knobs and returns a
 * {@link ChatResult}, having translated its own auth, rate-limit, not-found,
 * connection, refusal and truncation failures into a {@link ChatError}.
 */
import { env } from '$env/dynamic/private';

/** One turn of the conversation, in the provider's own plain-text shape. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  system: string;
  messages: ChatMessage[];
  model: string;
  maxOutputTokens: number;
  effort: string;
}

export interface ChatResult {
  /** The reply text. */
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason?: string;
  /** The model's reasoning before it replied, when the provider returns it. */
  reasoningText?: string;
  /** The provider's id for this request, for matching a call against its dashboard. */
  requestId?: string;
  /** Output tokens spent reasoning, when the provider reports them. */
  reasoningTokens?: number;
}

export interface Provider {
  readonly name: string;
  /** Used when `CHATBOT_MODEL` is not set. */
  readonly defaultModel: string;
  /** Environment variable holding this provider's API key. */
  readonly apiKeyEnv: string;
  /** Model-id prefixes this provider serves. */
  readonly modelPrefixes: readonly string[];
  ownsModel(_modelId: string): boolean;
  /** Whether this provider's API key is present in the environment. */
  hasApiKey(): boolean;
  chat(_options: ChatOptions): Promise<ChatResult>;
}

/**
 * Shared behavior: which model ids a provider serves. A `CHATBOT_MODEL` naming a
 * `claude-*` or `deepseek-*` model reaches the right provider even when
 * `CHATBOT_PROVIDER` names the other one.
 */
export abstract class BaseProvider implements Provider {
  public abstract readonly name: string;
  public abstract readonly defaultModel: string;
  public abstract readonly apiKeyEnv: string;
  public abstract readonly modelPrefixes: readonly string[];

  public ownsModel(modelId: string): boolean {
    const id = (modelId ?? '').toLowerCase();
    return this.modelPrefixes.some((prefix) => id.startsWith(prefix));
  }

  public hasApiKey(): boolean {
    return apiKey(this) !== undefined;
  }

  public abstract chat(_options: ChatOptions): Promise<ChatResult>;
}

/** This provider's API key, or `undefined` when the environment does not set one. */
export function apiKey(provider: Provider): string | undefined {
  const value = (env as Record<string, string | undefined>)[provider.apiKeyEnv];
  return value ? value : undefined;
}
