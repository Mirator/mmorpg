export function createVendorUI({ dialog, panel, dialogName, panelName, tradeButton, closeButton, panelCloseButton, onTradeOpen }) {
  let dialogOpen = false;
  let tradeOpen = false;
  let activeTab = 'buy';
  let currentVendor = null;

  const tabButtons = panel?.querySelectorAll?.('.vendor-tab') ?? [];
  const views = panel?.querySelectorAll?.('.vendor-view') ?? [];

  function setVendor(vendor) {
    currentVendor = vendor;
    const name = vendor?.name ?? 'Vendor';
    if (dialogName) dialogName.textContent = name;
    if (panelName) panelName.textContent = name;
  }

  function setDialogOpen(next) {
    dialogOpen = !!next;
    dialog?.classList.toggle('open', dialogOpen);
  }

  function setTradeOpen(next) {
    tradeOpen = !!next;
    panel?.classList.toggle('open', tradeOpen);
    document.body?.classList.toggle('trade-open', tradeOpen);
  }

  function setTab(tab) {
    if (!tab) return;
    activeTab = tab;
    for (const btn of tabButtons) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    }
    for (const view of views) {
      const isSell = view.classList.contains('vendor-sell');
      const isBuy = view.classList.contains('vendor-buy');
      const shouldShow = (tab === 'sell' && isSell) || (tab === 'buy' && isBuy);
      view.classList.toggle('active', shouldShow);
    }
  }

  function openDialog(vendor) {
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
    onTradeOpen?.();
  }

  function closeAll() {
    setDialogOpen(false);
    setTradeOpen(false);
    currentVendor = null;
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
