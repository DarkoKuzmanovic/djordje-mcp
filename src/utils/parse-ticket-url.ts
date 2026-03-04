/**
 * Extract a Gorgias ticket ID from a URL or plain number string.
 *
 * Supported formats:
 *   - "12345"
 *   - "https://simlab.gorgias.com/app/ticket/12345"
 *   - "https://simlab.gorgias.com/app/ticket/12345?foo=bar"
 */
export function parseTicketId(input: string): number {
  const trimmed = input.trim();

  // Plain number
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // Gorgias URL pattern
  const match = trimmed.match(/gorgias\.com\/app\/ticket\/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }

  throw new Error(
    `Cannot parse ticket ID from "${trimmed}". Provide a numeric ID or a Gorgias ticket URL.`,
  );
}
