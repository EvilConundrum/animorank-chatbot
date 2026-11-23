/**
 * DeepSeek provider: the OpenAI SDK pointed at `api.deepseek.com`.
 *
 * Ported from `animorank-clive`'s CLive provider. DeepSeek's API is
 * OpenAI-compatible; thinking is always on and asked for explicitly, and it is
 * paid for out of `max_tokens`, so a cap that is too small leaves an empty
 * reply (`finish_reason === 'length'`) and only partial reasoning.
 */
import OpenAI from 'openai';
import { ChatError } from '../errors';
import { apiKey, BaseProvider, type ChatOptions, type ChatResult } from './provider';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

/** The SDK's params plus DeepSeek's own `thinking` field, which is not in the SDK types. */
type DeepSeekParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming & {
  thinking: { type: 'enabled' };
};

export class DeepSeekProvider extends BaseProvider {
  public readonly name = 'deepseek';
  public readonly defaultModel = 'deepseek-flash';
  public readonly apiKeyEnv = 'DEEPSEEK_API_KEY';
  public readonly modelPrefixes = ['deepseek-'];

  public async chat(options: ChatOptions): Promise<ChatResult> {
    const client = new OpenAI({ apiKey: apiKey(this), baseURL: DEEPSEEK_BASE_URL });

    const params: DeepSeekParams = {
      model: options.model,
      max_tokens: options.maxOutputTokens,
      messages: [{ role: 'system', content: options.system }, ...options.messages],
      stream: true,
      stream_options: { include_usage: true },
      thinking: { type: 'enabled' }
    };

    const textParts: string[] = [];
    const reasoningParts: string[] = [];
    let finishReason: string | null = null;
    let usage: OpenAI.Completions.CompletionUsage | undefined;
    let servedModel: string | undefined;
    let requestId: string | undefined;

    try {
      const stream = await client.chat.completions.create(params);
      for await (const chunk of stream) {
        requestId = requestId ?? chunk.id;
        servedModel = chunk.model || servedModel;
        usage = chunk.usage ?? usage;
        for (const choice of chunk.choices ?? []) {
          const delta = choice.delta;
          // `reasoning_content` is not a field the SDK types know about; `in` narrows
          // the read to unknown, and the typeof check validates it.
          if ('reasoning_content' in delta && typeof delta.reasoning_content === 'string') {
            reasoningParts.push(delta.reasoning_content);
          }
          if (typeof delta.content === 'string' && delta.content) textParts.push(delta.content);
          finishReason = choice.finish_reason ?? finishReason;
        }
      }
    } catch (error) {
      throw translate(error, options.model);
    }

    const text = textParts.join('');
    const reasoning = reasoningParts.join('') || undefined;

    if (finishReason === 'length') {
      throw new ChatError(
        'The reply hit max_tokens before it finished. The model’s reasoning counts against that ' +
          'limit too. Raise CHATBOT_MAX_OUTPUT_TOKENS.'
      );
    }
    if (finishReason === 'content_filter') {
      throw new ChatError('The model declined to answer (content filtered).');
    }
    if (!text.trim()) {
      throw new ChatError('The model returned an empty reply.');
    }

    return {
      text,
      model: servedModel ?? options.model,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      stopReason: finishReason ?? undefined,
      reasoningText: reasoning,
      requestId,
      reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens
    };
  }
}

function translate(error: unknown, model: string): ChatError {
  if (error instanceof OpenAI.AuthenticationError) {
    return new ChatError('The API key was rejected. Check DEEPSEEK_API_KEY.');
  }
  if (error instanceof OpenAI.NotFoundError) {
    return new ChatError(`The model '${model}' does not exist or is not available to this key.`);
  }
  if (error instanceof OpenAI.RateLimitError) {
    const retryAfter = error.headers?.get('retry-after') ?? '60';
    return new ChatError(`Rate limited; retry after ${retryAfter}s.`, 429);
  }
  if (error instanceof OpenAI.APIError) {
    return new ChatError(`API error ${error.status}: ${error.message}`);
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new ChatError('Could not reach the API. Check your connection.');
  }
  return new ChatError(
    `The reply stopped arriving: ${error instanceof Error ? error.name : typeof error}: ${
      error instanceof Error ? error.message.slice(0, 200) : String(error)
    }`
  );
}
