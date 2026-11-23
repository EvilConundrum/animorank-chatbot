/**
 * Provider resolution, ported from `animorank-clive`'s CLive plugin.
 *
 * An explicit name wins; otherwise the provider whose model prefixes claim the
 * configured model id; otherwise `CHATBOT_PROVIDER`; otherwise `anthropic`.
 */
import { env } from '$env/dynamic/private';
import { ChatError } from '../errors';
import { AnthropicProvider } from './anthropic';
import { DeepSeekProvider } from './deepseek';
import type { Provider } from './provider';

export const REGISTRY: Record<string, Provider> = {
  anthropic: new AnthropicProvider(),
  deepseek: new DeepSeekProvider()
};

export function getProvider(options: { name?: string; model?: string } = {}): Provider {
  if (options.name) {
    const provider = REGISTRY[options.name];
    if (!provider) throw unknownProvider(options.name);
    return provider;
  }
  if (options.model) {
    const owner = Object.values(REGISTRY).find((provider) => provider.ownsModel(options.model as string));
    if (owner) return owner;
  }
  const configured = env.CHATBOT_PROVIDER;
  if (configured) {
    const provider = REGISTRY[configured];
    if (!provider) throw unknownProvider(configured);
    return provider;
  }
  return REGISTRY.anthropic;
}

function unknownProvider(key: string): ChatError {
  return new ChatError(
    `Unknown provider '${key}'. Set CHATBOT_PROVIDER to one of: ${Object.keys(REGISTRY).sort().join(', ')}.`
  );
}

export { apiKey } from './provider';
export type { ChatMessage, ChatOptions, ChatResult, Provider } from './provider';
