export function createNet({ url, onOpen, onClose, onMessage, onError }) {
  const ws = new WebSocket(url);

  function send(msg) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  ws.addEventListener('open', () => {
    onOpen?.();
  });

  ws.addEventListener('close', (event) => {
    onClose?.(event);
  });

  ws.addEventListener('error', () => {
    onError?.();
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    onMessage?.(msg);
  });

  return {
    send,
    close: () => ws.close(),
    ws,
  };
}
