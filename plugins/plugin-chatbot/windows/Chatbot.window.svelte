<script lang="ts">
  import { tick } from 'svelte';
  import transform from '@diplodoc/transform';
  import defaultPlugins from '@diplodoc/transform/lib/plugins';
  import Button from '$lib/components/ui/buttons/Button.svelte';
  import Textarea from '$lib/components/ui/textareas/Textarea.svelte';
  import Spinner from '@iconify-svelte/fa6-solid/spinner';
  import PaperPlaneIcon from '@iconify-svelte/fa6-solid/paper-plane';
  import type { SolveWindowContext } from '../../../src/routes/problem/[problem_id]/[session_id]/context.svelte';
  import { sendChat, type ChatTurn } from './api';
  import { CHATBOT_EVENT } from './telemetry';

  let { context }: { context: SolveWindowContext } = $props();

  let turns = $state<ChatTurn[]>([]);
  let draft = $state('');
  let sending = $state(false);
  let error = $state<string | null>(null);
  let scroller = $state<HTMLDivElement>();

  // The reply is rendered as markdown, but raw HTML in it is not trusted: the
  // model's text is not the problem statement, so `allowHTML` stays off.
  const markdown = (content: string) => transform(content, { allowHTML: false, plugins: defaultPlugins }).result.html;

  async function send(): Promise<void> {
    const text = draft.trim();
    if (sending || !text) return;

    error = null;
    turns.push({ role: 'user', content: text });
    draft = '';
    await requestReply();
  }

  /** Retry the turn that failed; the conversation already ends with the student's message. */
  async function retry(): Promise<void> {
    if (sending || turns.at(-1)?.role !== 'user') return;
    error = null;
    await requestReply();
  }

  async function requestReply(): Promise<void> {
    const asked = turns.at(-1);
    if (!asked || asked.role !== 'user') return;

    // Snapshot what the model was shown, so the history entry describes this
    // turn even if the editor changes while the reply is in flight.
    const code = context.editorState.code;
    const codeLength = code.length;
    const started = performance.now();
    sending = true;
    try {
      const answer = await sendChat({
        sessionId: context.practiceSession.id,
        messages: turns.map(({ role, content }) => ({ role, content })),
        code,
        language: context.language
      });
      turns.push({ role: 'assistant', content: answer.reply });
      context.telemetry.record(CHATBOT_EVENT.turn, {
        message: asked.content,
        reply: answer.reply,
        model: answer.model,
        input_tokens: answer.usage.input_tokens,
        output_tokens: answer.usage.output_tokens,
        latency_ms: Math.round(performance.now() - started),
        code_length: codeLength
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : 'The chatbot could not answer.';
      error = reason;
      context.telemetry.record(CHATBOT_EVENT.error, {
        message: asked.content,
        error: reason,
        code_length: codeLength
      });
    } finally {
      sending = false;
      // A turn is a discrete, paid interaction, not a keystroke: write it now
      // instead of waiting for the poll that batches the editor's entries.
      void context.telemetry.flush();
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void send();
  }

  // Follow the conversation as it grows. Building this snapshot reads both
  // pieces of state, which is what makes the effect re-run when a turn lands or
  // the typing indicator goes.
  $effect(() => {
    const state = { turns: turns.length, sending };
    void tick().then(() =>
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: state.sending ? 'auto' : 'smooth' })
    );
  });
</script>

<div class="flex h-full min-h-0 flex-col">
  <div
    bind:this={scroller}
    class="flex-1 min-h-0 space-y-4 overflow-y-auto p-4"
  >
    {#if turns.length === 0}
      <p class="text-sm text-base-content/60">
        Ask about the problem, your code, or a test case. The model can see the statement, your current code and the
        public test cases.
      </p>
    {/if}

    {#each turns as turn, index (index)}
      {#if turn.role === 'user'}
        <div class="flex justify-end">
          <div
            class="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-content"
          >
            {turn.content}
          </div>
        </div>
      {:else}
        <!-- The markdown is rendered with @diplodoc/transform's allowHTML off, so
             raw HTML in the model's reply is escaped rather than injected. -->
        <div class="yfm max-w-full break-words text-sm">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html markdown(turn.content)}
        </div>
      {/if}
    {/each}

    {#if sending}
      <div
        class="flex items-center gap-2 text-sm text-base-content/60"
        aria-live="polite"
      >
        <Spinner class="h-4 w-4 animate-spin" />
        Thinking…
      </div>
    {/if}

    {#if error}
      <div
        class="alert alert-error alert-soft text-sm"
        role="alert"
      >
        <span>{error}</span>
        {#if turns.at(-1)?.role === 'user'}
          <Button
            class="btn-xs"
            onclick={retry}
            disabled={sending}
          >
            Retry
          </Button>
        {/if}
      </div>
    {/if}
  </div>

  <form
    class="flex shrink-0 items-end gap-2 border-t border-base-200 p-3"
    onsubmit={(event) => {
      event.preventDefault();
      void send();
    }}
  >
    <Textarea
      bind:value={draft}
      class="textarea-sm min-h-10 flex-1 resize-none"
      rows={1}
      placeholder="Ask a question…"
      aria-label="Message"
      disabled={sending}
      onkeydown={onKeydown}
    />
    <Button
      type="submit"
      class="btn-primary btn-sm btn-square"
      disabled={sending || !draft.trim()}
      aria-label="Send message"
    >
      <PaperPlaneIcon class="h-4 w-4" />
    </Button>
  </form>
</div>
