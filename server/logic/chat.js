// @ts-check
/** @type {Record<string, number>} */
const CHAT_BUFFER_SIZES = {
  global: 500,
  area: 500,
  trade: 500,
  party: 500,
  combat: 100,
};

/** @typedef {{ channel: string, authorId: string, author: string, text: string, timestamp: number }} ChatMessage */
/** @typedef {{ push: (msg: ChatMessage) => ChatMessage, getSince: (timestamp: number | undefined) => ChatMessage[] }} ChatRingBuffer */

/**
 * @param {string} channel
 * @param {number} maxSize
 * @returns {ChatRingBuffer}
 */
function createRingBuffer(channel, maxSize) {
  /** @type {ChatMessage[]} */
  const buffer = [];
  return {
    /** @param {ChatMessage} msg */
    push(msg) {
      buffer.push(msg);
      if (buffer.length > maxSize) {
        buffer.shift();
      }
      return msg;
    },
    /** @param {number | undefined} timestamp */
    getSince(timestamp) {
      if (!Number.isFinite(timestamp)) return buffer;
      const since = Number(timestamp);
      return buffer.filter((m) => m.timestamp >= since);
    },
  };
}

/** @type {Record<string, ChatRingBuffer>} */
const buffers = {};
for (const ch of Object.keys(CHAT_BUFFER_SIZES)) {
  buffers[ch] = createRingBuffer(ch, CHAT_BUFFER_SIZES[ch]);
}

/**
 * Sanitize chat text: remove control chars, newlines, normalize.
 * @param {string} raw
 * @param {number} maxLen
 * @returns {string}
 */
export function sanitizeChatText(raw, maxLen = 200) {
  if (typeof raw !== 'string') return '';
  let s = raw.normalize('NFC');
  s = s.replace(/[\x00-\x1F\x7F]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, maxLen);
}

/**
 * Add a chat message to the store and return it.
 * @param {string} channel
 * @param {string} authorId
 * @param {string} author
 * @param {string} text
 * @param {number} timestamp
 * @returns {{ channel: string, authorId: string, author: string, text: string, timestamp: number } | null}
 */
export function addMessage(channel, authorId, author, text, timestamp) {
  const buf = buffers[channel];
  if (!buf) return null;
  const sanitized = sanitizeChatText(text, 200);
  if (!sanitized) return null;
  const msg = {
    channel,
    authorId,
    author: sanitizeChatText(author || 'Unknown', 64),
    text: sanitized,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
  return buf.push(msg);
}

/**
 * Get recent messages for a channel (for future use; not sent on connect).
 * @param {string} channel
 * @param {number} [sinceTimestamp]
 * @returns {ChatMessage[]}
 */
export function getRecentMessages(channel, sinceTimestamp) {
  const buf = buffers[channel];
  if (!buf) return [];
  return buf.getSince(sinceTimestamp);
}
