import type { ClientAnimoRankAPI } from '$lib/api/client';
import { ClientPlugin } from '$lib/plugin/clientPlugin';
import type { SolveWindowContext } from '../../src/routes/problem/[problem_id]/[session_id]/context.svelte';
import { SolveWindowRegistry } from '../../src/routes/problem/[problem_id]/[session_id]/windowRegistry';
import { ChatbotWindow } from './windows/Chatbot.window';

/** The key this plugin's window is registered under, in the plugin's own namespace. */
const WINDOW = 'chat';

/**
 * The chat column starts narrower than the editor's column: it is a sidebar,
 * not the workspace. The minimum keeps a long word and the send button usable;
 * the student can still drag the split wider for a long answer.
 */
const CHAT_WIDTH = { initialWidth: 300, minimumWidth: 260 };

/**
 * The page is three columns: the statement on the left, the editor and its
 * results in the middle, and the chat in its own column on the right.
 *
 * The window is closed before it is opened so the placement is applied even to
 * a layout saved while the chat lived somewhere else: `openWindow` only focuses
 * a panel that is already open, wherever it happens to be. Closing keeps the
 * window and its conversation built -- the manager retains both -- so reopening
 * restores the chat where the student left it. The statement is then focused,
 * as the page would be without this plugin.
 */
export default class ChatbotClientPlugin extends ClientPlugin {
  public async init(api: ClientAnimoRankAPI): Promise<void> {
    api.clientRegistryProviderRegistrar.getRegistrar(SolveWindowRegistry).register(WINDOW, ChatbotWindow);
  }

  public async onSolvePageLoad(context: SolveWindowContext): Promise<void> {
    const key = `chatbot:${WINDOW}`;
    context.closeWindow(key);
    await context.openWindow(key, { direction: 'right', referencePanel: 'code_editor' }, CHAT_WIDTH);
    await context.openWindow('problem_info');
  }
}
