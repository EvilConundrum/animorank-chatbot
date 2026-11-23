/**
 * Anthropic provider: `client.messages.create` with adaptive thinking.
 *
 * Ported from `animorank-clive`'s CLive provider, which uses `messages.parse`
 * with schema-enforced JSON. A chat reply has no schema, so the reply is the
 * message's text blocks, joined; the thinking blocks are the model's reasoning
 * and are not part of what the student reads.
 */
import Anthropic from '@anthropic-ai/sdk';
import { ChatError } from '../errors';
import { apiKey, BaseProvider, type ChatOptions, type ChatResult } from './provider';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof EFFORTS)[number];

/** The parts of a reply this provider keeps: the text, and the thinking beside it. */
interface ReplyParts {
  text: string;
  reasoningText?: string;
}

export class AnthropicProvider extends BaseProvider {
  public readonly name = 'anthropic';
  public readonly defaultModel = 'claude-opus-5';
  public readonly apiKeyEnv = 'ANTHROPIC_API_KEY';
  public readonly modelPrefixes = ['claude-'];

  public async chat(options: ChatOptions): Promise<ChatResult> {
    const client = new Anthropic({ apiKey: apiKey(this) });
    const effort: Effort = (EFFORTS as readonly string[]).includes(options.effort)
      ? (options.effort as Effort)
      : 'medium';

    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: options.model,
        max_tokens: options.maxOutputTokens,
        system: options.system,
        messages: options.messages,
        thinking: { type: 'adaptive' },
        output_config: { effort }
      });
    } catch (error) {
      throw translate(error, options.model);
    }

    const parts = replyParts(message);
    if (message.stop_reason === 'refusal') {
      throw new ChatError(
        `The model declined to answer (${message.stop_details?.explanation ?? 'no explanation given'}).`
      );
    }
    if (message.stop_reason === 'max_tokens') {
      throw new ChatError('The reply hit max_tokens and was cut off. Raise CHATBOT_MAX_OUTPUT_TOKENS.');
    }
    if (!parts.text.trim()) {
      throw new ChatError('The model returned an empty reply.');
    }

    return {
      text: parts.text,
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      stopReason: message.stop_reason ?? undefined,
      reasoningText: parts.reasoningText,
      requestId: message.id
    };
  }
}

/** The reply's text, and any summarized thinking the provider returned with it. */
function replyParts(message: Anthropic.Message): ReplyParts {
  const text: string[] = [];
  const reasoning: string[] = [];

  for (const block of message.content) {
    if (block.type === 'text') text.push(block.text);
    else if (block.type === 'thinking') reasoning.push(block.thinking);
  }

  return {
    text: text.join(''),
    reasoningText: reasoning.length ? reasoning.join('') : undefined
  };
}

function translate(error: unknown, model: string): ChatError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new ChatError('The API key was rejected. Check ANTHROPIC_API_KEY.');
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ChatError(`The model '${model}' does not exist or is not available to this key.`);
  }
  if (error instanceof Anthropic.RateLimitError) {
    const retryAfter = error.headers?.get('retry-after') ?? '60';
    return new ChatError(`Rate limited; retry after ${retryAfter}s.`, 429);
  }
  if (error instanceof Anthropic.APIError) {
    return new ChatError(`API error ${error.status}: ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ChatError('Could not reach the API. Check your connection.');
  }
  return new ChatError(`Anthropic call failed: ${error instanceof Error ? error.message : String(error)}`);
}
