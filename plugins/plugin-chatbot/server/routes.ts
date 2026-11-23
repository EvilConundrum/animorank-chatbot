/**
 * The plugin's HTTP surface: `POST /chat`, mounted by the app under
 * `/plugin-api/chatbot` (the plugin's id).
 */
import { requestUserId, ServerAPI } from '$lib/server/serverAPI';
import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import z from 'zod';
import { chat, CODE_MAX, MESSAGE_MAX } from './chat';
import { ChatError } from './errors';

// The page keeps the whole conversation, so the route accepts more turns than
// one model call is sent; `chat` keeps the most recent HISTORY_LIMIT.
const REQUEST_MESSAGES_MAX = 200;

const bodySchema = z.object({
  sessionId: z.uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(MESSAGE_MAX)
      })
    )
    .min(1)
    .max(REQUEST_MESSAGES_MAX),
  code: z.string().max(CODE_MAX).optional(),
  language: z.string().max(32).optional()
});

class ChatbotAPI extends ServerAPI {
  public async fastifyPlugin(): Promise<FastifyPluginCallback> {
    return (app) => {
      app.post('/chat', async (request, reply) => {
        const userId = requestUserId(request);
        if (!userId) return sendError(reply, 'Sign in to use the chatbot.', 401);

        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) return sendError(reply, 'Could not read the request.', 400);
        if (parsed.data.messages.at(-1)?.role !== 'user') {
          return sendError(reply, 'The last message must be from the student.', 400);
        }

        try {
          return reply.send(await chat(userId, parsed.data));
        } catch (error) {
          if (error instanceof ChatError) return sendError(reply, error.message, error.status);
          request.log.error({ err: error }, 'The chatbot request failed');
          return sendError(reply, 'The chatbot request failed.', 500);
        }
      });
    };
  }
}

function sendError(reply: FastifyReply, message: string, code: number) {
  return reply.code(code).send({ error: message });
}

export default ChatbotAPI;
