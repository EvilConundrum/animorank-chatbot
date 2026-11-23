/**
 * The entries the chatbot records into the practice session's history, through
 * `TelemetryService.record` → `/api/updateHistory`. They sit beside the editor
 * hooks' entries, so a session's history shows what the student asked and what
 * the model answered.
 *
 * - `CHATBOT_TURN` — `{ message, reply, model, input_tokens, output_tokens,
 *   latency_ms, code_length }`: one completed exchange. `message` is what the
 *   student sent, `reply` is the model's answer, and the token counts are the
 *   provider's own usage for that call. `code_length` is the size of the code
 *   the model was shown, which is not necessarily what autosave had stored.
 * - `CHATBOT_ERROR` — `{ message, error, code_length }`: a turn that did not
 *   reach a reply. The student's message is kept so the failed ask is not lost;
 *   `error` is the sentence the page showed.
 */
export const CHATBOT_EVENT = {
  turn: 'CHATBOT_TURN',
  error: 'CHATBOT_ERROR'
} as const;
