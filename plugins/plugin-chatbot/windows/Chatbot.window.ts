import { Window } from '$lib/window';
import type { SolveWindowContext } from '../../../src/routes/problem/[problem_id]/[session_id]/context.svelte';
import Chatbot from './Chatbot.window.svelte';

export class ChatbotWindow extends Window<SolveWindowContext> {
  static title = 'Chat';
  static closeable = true;
  constructor(context: SolveWindowContext) {
    super(
      {
        title: ChatbotWindow.title,
        closable: ChatbotWindow.closeable,
        context
      },
      Chatbot
    );
  }
}
