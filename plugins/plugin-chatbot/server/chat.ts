/**
 * One chat turn: gather the context the model should see, render it into the
 * system message with the authored prompt and templates, and ask the provider.
 *
 * The context is read here rather than trusted from the browser: the session is
 * resolved from its id, its owner is checked, and its problem and public test
 * cases are loaded through the services that already enforce access. Only the
 * student's live code comes from the request, because it may be newer than what
 * autosave has persisted.
 */
import type { User } from '@auth/sveltekit';
import { env } from '$env/dynamic/private';
import { ProblemService } from '$lib/problem/problemService';
import { PracticeSessionService } from '$lib/practiceSession/practiceSessionService';
import { ServerRegistryProvider } from '$lib/registry/server';
import { TestCaseService } from '$lib/testCase/testCaseService';
import { renderSystemPrompt, type TestCaseForPrompt } from './content';
import { ChatError } from './errors';
import { getProvider, type ChatMessage, type ChatResult } from './providers';

/** The most recent turns sent to the model; older turns fall out of the window. */
export const HISTORY_LIMIT = 40;

/** The longest single message the route accepts, and the code it accepts beside it. */
export const MESSAGE_MAX = 12000;
export const CODE_MAX = 60000;

export interface ChatRequest {
  /** The practice session the conversation is about. */
  sessionId: string;
  /** The conversation so far, ending with the student's new message. */
  messages: ChatMessage[];
  /** The code in the editor. Falls back to the session's saved code when absent. */
  code?: string;
  /** The editor's language id, when it differs from the problem's. */
  language?: string;
}

/** One finished reply, as the route sends it back. */
export interface ChatAnswer {
  reply: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function chat(userId: string, request: ChatRequest): Promise<ChatAnswer> {
  const registry = ServerRegistryProvider.instance();
  const user = { id: userId } as User;

  const practiceSession = await (
    await registry.getService(PracticeSessionService)
  ).findById({ id: request.sessionId, user });
  // The service resolves a session by id alone, unlike its update and delete
  // paths which also filter on student_id. Without this check any signed-in user
  // could read another student's problem context through their own request.
  if (!practiceSession) throw new ChatError('This practice session was not found.', 404);
  if (practiceSession.studentId !== userId) throw new ChatError('This practice session is not yours.', 403);

  const problem = await (await registry.getService(ProblemService)).findById({ id: practiceSession.problemId, user });
  if (!problem) throw new ChatError('The problem for this practice session was not found.', 404);

  // The service returns every case the user may read, hidden ones included.
  // The model may only see what the student can already see.
  const publicTests: TestCaseForPrompt[] = [];
  for (const testCase of await (
    await registry.getService(TestCaseService)
  ).findByProblem({
    problemId: problem.id,
    user
  })) {
    if (!testCase.testCase.model.public) continue;
    publicTests.push({
      index: publicTests.length + 1,
      type: testCase.testCase.model.type,
      data: testCase.testCase.model.data
    });
  }

  const language = String(problem.model.language);
  const systemPrompt = renderSystemPrompt({
    problem: {
      name: problem.name,
      description: problem.description,
      starter_code: problem.getProcessedCode(),
      language
    },
    code: {
      language: request.language ?? language,
      value: request.code ?? practiceSession.previousCode.fullCode
    },
    test_cases: publicTests
  });

  const configuredModel = env.CHATBOT_MODEL?.trim() || undefined;
  const provider = getProvider({ model: configuredModel });
  if (!provider.hasApiKey()) {
    throw new ChatError(
      `No API key for provider '${provider.name}'. Set ${provider.apiKeyEnv} in the environment, then restart the server.`
    );
  }

  // Trimming can land mid-turn. Both providers accept a transcript that starts
  // with the student, so an assistant reply whose question fell out is dropped.
  const messages = request.messages.slice(-HISTORY_LIMIT);
  while (messages[0]?.role === 'assistant') messages.shift();

  const configuredMax = Number.parseInt(env.CHATBOT_MAX_OUTPUT_TOKENS ?? '', 10);
  const result: ChatResult = await provider.chat({
    system: systemPrompt,
    messages,
    model: configuredModel ?? provider.defaultModel,
    maxOutputTokens: Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : 4000,
    effort: env.CHATBOT_EFFORT?.trim() || 'medium'
  });

  return {
    reply: result.text,
    model: result.model,
    usage: { input_tokens: result.inputTokens, output_tokens: result.outputTokens }
  };
}
