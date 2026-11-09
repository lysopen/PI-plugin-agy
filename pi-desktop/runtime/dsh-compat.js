/**
 * Small compatibility surface for the DSH runtime files reused by the
 * PI-Desktop adapter.  The ACP implementation only needs stable error codes
 * and tool-call id identity; it does not need the DSH package itself.
 */
export class LlmError extends Error {
  constructor(message, code = 'PROVIDER_ERROR', details = undefined) {
    super(String(message));
    this.name = 'LlmError';
    this.code = code;
    if (details && typeof details === 'object') Object.assign(this, details);
  }
}
export const ToolCallId = (value) => String(value);