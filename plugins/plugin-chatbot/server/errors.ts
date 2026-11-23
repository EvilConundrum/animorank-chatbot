/**
 * A failure whose message is meant for the student. Provider, content and route
 * failures all become one of these, so the page gets a sentence it can show
 * rather than a stack trace or an SDK error object.
 */
export class ChatError extends Error {
  /** The HTTP status the route answers with. */
  public readonly status: number;

  /**
   * @param message the sentence the page shows
   * @param status the HTTP status the route answers with
   */
  public constructor(message: string, status = 500) {
    super(message);
    this.name = 'ChatError';
    this.status = status;
  }
}
