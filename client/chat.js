const WRITABLE_CHANNELS = new Set(['global', 'area', 'trade']);
const GENERAL_SENDS_TO = 'area';
const MAX_COMBAT_ENTRIES = 50;

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function createChat({ onSend, isInParty = () => false }) {
  const panel = document.getElementById('chat-panel');
  const messagesEl = document.getElementById('chat-messages');
  const inputEl = document.getElementById('chat-input');
  const inputWrap = panel?.querySelector('.chat-input-wrap');

  const messagesByChannel = {
    general: [],
    global: [],
    area: [],
    combat: [],
    trade: [],
    party: [],
  };

  let activeChannel = 'general';

  function setInParty() {
    /* Reserved for future party system */
  }

  function canWrite(channel) {
    if (channel === 'general') return true;
    if (channel === 'party') return isInParty();
    return WRITABLE_CHANNELS.has(channel);
  }

  function getSendChannel(channel) {
    return channel === 'general' ? GENERAL_SENDS_TO : channel;
  }

  function updateInputState() {
    const writable = canWrite(activeChannel);
    if (inputWrap) {
      inputWrap.classList.toggle('readonly', !writable);
    }
    if (inputEl) {
      inputEl.placeholder = writable ? 'Type a message...' : 'Read only';
    }
  }

  function addToGeneral(data, sourceChannel) {
    const generalList = messagesByChannel.general;
    const entry = { ...data, sourceChannel: sourceChannel ?? data.channel ?? data.sourceChannel };
    generalList.push(entry);
    if (generalList.length > 200) {
      generalList.shift();
    }
  }

  function addMessage(channel, data) {
    const list = messagesByChannel[channel];
    if (!list) return;
    const entry = { ...data };
    list.push(entry);
    if (channel === 'combat' && list.length > MAX_COMBAT_ENTRIES) {
      list.shift();
    }
    addToGeneral(entry, channel);
    const displayChannel = channel;
    if (channel === activeChannel || activeChannel === 'general') {
      renderMessage(entry, displayChannel);
    }
  }

  const GENERAL_COMBAT_KINDS = new Set(['xp_gain', 'level_up', 'death']);

  function addCombatLogEntries(entries) {
    if (!Array.isArray(entries)) return;
    for (const e of entries) {
      const kind = e.kind ?? 'info';
      const data = {
        kind: 'combat',
        combatKind: kind,
        text: e.text ?? '',
        timestamp: e.t ?? Date.now(),
      };
      const combatList = messagesByChannel.combat;
      combatList.push(data);
      if (combatList.length > MAX_COMBAT_ENTRIES) {
        combatList.shift();
      }
      if (GENERAL_COMBAT_KINDS.has(kind)) {
        addToGeneral(data, 'combat');
      }
      const showInGeneral = GENERAL_COMBAT_KINDS.has(kind);
      if (activeChannel === 'combat' || (activeChannel === 'general' && showInGeneral)) {
        renderMessage(data, 'combat');
      }
    }
  }

  function renderMessage(data, channel) {
    if (!messagesEl) return;
    const div = document.createElement('div');
    const combatKind = data.combatKind ?? 'info';
    div.className = `chat-message${combatKind ? ` chat-combat-${combatKind}` : ''}`;
    const time = formatTime(data.timestamp ?? Date.now());
    const displayChannel = data.sourceChannel ?? channel;
    if (data.kind === 'combat') {
      div.innerHTML = `<span class="chat-time">[${time}]</span><span class="chat-channel">[combat]</span><span class="chat-text">${escapeHtml(data.text)}</span>`;
    } else if (data.kind === 'system') {
      div.innerHTML = `<span class="chat-time">[${time}]</span><span class="chat-channel">[system]</span><span class="chat-text">${escapeHtml(data.text)}</span>`;
    } else {
      const channelLabel = displayChannel ? `[${displayChannel}]` : '';
      const author = data.author ? `${escapeHtml(data.author)}:` : '';
      div.innerHTML = `<span class="chat-time">[${time}]</span><span class="chat-channel">${channelLabel}</span><span class="chat-author">${author}</span><span class="chat-text">${escapeHtml(data.text)}</span>`;
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function switchChannel(channel) {
    if (!messagesByChannel[channel]) return;
    activeChannel = channel;
    const tabs = panel?.querySelectorAll('.chat-tab');
    tabs?.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.channel === channel);
    });
    if (messagesEl) {
      messagesEl.innerHTML = '';
      for (const msg of messagesByChannel[channel]) {
        renderMessage(msg, channel);
      }
    }
    updateInputState();
  }

  function send() {
    const text = inputEl?.value?.trim();
    if (!text || !onSend) return;
    if (!canWrite(activeChannel)) return;
    const sendChannel = getSendChannel(activeChannel);
    onSend(sendChannel, text);
    inputEl.value = '';
  }

  function init() {
    const tabs = panel?.querySelectorAll('.chat-tab');
    tabs?.forEach((tab) => {
      tab.addEventListener('click', () => {
        switchChannel(tab.dataset.channel);
      });
    });

    inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        send();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        inputEl.blur();
        inputEl.value = '';
      }
    });

    updateInputState();
  }

  init();

  function addSystemMessage(text) {
    const data = {
      kind: 'system',
      text: String(text),
      timestamp: Date.now(),
    };
    const entry = { ...data, sourceChannel: 'system' };
    messagesByChannel.general.push(entry);
    if (messagesByChannel.general.length > 200) {
      messagesByChannel.general.shift();
    }
    if (activeChannel === 'general') {
      renderMessage(data, 'system');
    }
  }

  return {
    addMessage,
    addCombatLogEntries,
    addSystemMessage,
    setInParty,
    isChatFocused: () => document.activeElement === inputEl,
  };
}
