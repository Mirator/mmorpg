// @ts-check
export function createVendorUI(/** @type {any} */ {
  dialog,
  panel,
  dialogName,
  panelName,
  tradeButton,
  closeButton,
  panelCloseButton,
  onTradeOpen,
  onTradeClose,
}) {
  let dialogOpen = false;
  let tradeOpen = false;
  let activeTab = 'buy';
  let /** @type {any} */ currentVendor = null;

  const tabButtons = panel?.querySelectorAll?.('.vendor-tab') ?? [];
  const views = panel?.querySelectorAll?.('.vendor-view') ?? [];

  function setVendor(/** @type {any} */ vendor) {
    currentVendor = vendor;
    const name = vendor?.name ?? 'Vendor';
    if (dialogName) dialogName.textContent = name;
    if (panelName) panelName.textContent = name;
  }

  function setDialogOpen(/** @type {any} */ next) {
    dialogOpen = !!next;
    dialog?.classList.toggle('open', dialogOpen);
  }

  function setTradeOpen(/** @type {any} */ next) {
    tradeOpen = !!next;
    panel?.classList.toggle('open', tradeOpen);
    document.body?.classList.toggle('trade-open', tradeOpen);
  }

  function setTab(/** @type {any} */ tab) {
    if (!tab) return;
    activeTab = tab;
    for (const btn of tabButtons) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    }
    for (const view of views) {
      const viewTab = view.dataset.tab
        ?? (view.classList.contains('vendor-sell')
          ? 'sell'
          : (view.classList.contains('vendor-buy') ? 'buy' : ''));
      const shouldShow = viewTab === tab;
      view.classList.toggle('active', shouldShow);
    }
  }

  function openDialog(/** @type {any} */ vendor) {
    if (!vendor) return;
    setVendor(vendor);
    setTradeOpen(false);
    setDialogOpen(true);
  }

  function openTrade() {
    if (!currentVendor) return;
    setTab('buy');
    setDialogOpen(false);
    setTradeOpen(true);
    onTradeOpen?.(currentVendor);
  }

  function closeAll() {
    const wasTradeOpen = tradeOpen;
    setDialogOpen(false);
    setTradeOpen(false);
    currentVendor = null;
    if (wasTradeOpen) {
      onTradeClose?.();
    }
  }

  function isDialogOpen() {
    return dialogOpen;
  }

  function isTradeOpen() {
    return tradeOpen;
  }

  function getVendor() {
    return currentVendor;
  }

  function getTab() {
    return activeTab;
  }

  tradeButton?.addEventListener('click', () => {
    openTrade();
  });

  closeButton?.addEventListener('click', () => {
    closeAll();
  });

  panelCloseButton?.addEventListener('click', () => {
    closeAll();
  });

  for (const btn of tabButtons) {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      setTab(tab);
    });
  }

  return {
    openDialog,
    openTrade,
    closeAll,
    setTab,
    isDialogOpen,
    isTradeOpen,
    getVendor,
    getTab,
  };
}
