/**
 * logSecurityEvent
 * ----------------
 * Structured, greppable security-event logging. Console-based on purpose —
 * this project doesn't need a dedicated log aggregation service, but every
 * line here is prefixed with "[SECURITY]" and is valid JSON after that
 * prefix, so it can be found later (e.g. `docker compose logs backend |
 * grep '\[SECURITY\]'`) and fed into a real log pipeline without changing
 * any call site.
 *
 * NEVER pass a password, a raw JWT, or a full request body into `details`
 * — only identifiers (usernames/emails/ids), IPs, route paths, and
 * outcomes belong here.
 *
 * @param {string} event   short, stable event name, e.g. 'login_failed'
 * @param {object} details event-specific fields (ip, identifier, route, etc.)
 */
export function logSecurityEvent(event, details = {}) {
  console.log('[SECURITY]', JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...details,
  }));
}
