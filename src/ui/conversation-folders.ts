const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function initConversationFolders() {
  // The folder controls are absent from the current interface. Do not let this legacy
  // optional feature abort the main module before its initial render.
  const requiredIds = ['dialogue-feed', 'conversation-folder-toggle', 'conversation-folders', 'conversation-folder-count', 'conversation-folder-chevron', 'conversation-target'];
  if (requiredIds.some(id => !document.getElementById(id))) return;
  const feed = byId<HTMLElement>('dialogue-feed');
  const toggle = byId<HTMLButtonElement>('conversation-folder-toggle');
  const folderList = byId<HTMLElement>('conversation-folders');
  const count = byId<HTMLElement>('conversation-folder-count');
  const chevron = byId<HTMLElement>('conversation-folder-chevron');
  const target = byId<HTMLElement>('conversation-target');
  const popup = document.createElement('div');
  popup.className = 'conversation-popup-backdrop';
  popup.hidden = true;
  popup.innerHTML = '<section class="conversation-popup" role="dialog" aria-modal="true" aria-labelledby="conversation-popup-title"><header class="conversation-popup-header"><div><p class="section-label">ARCHIVO PERSONAL</p><h2 id="conversation-popup-title">Conversación</h2></div><button type="button" class="conversation-popup-close" aria-label="Cerrar conversación">×</button></header><div class="conversation-popup-messages"></div></section>';
  document.body.append(popup);
  const popupTitle = popup.querySelector<HTMLElement>('#conversation-popup-title')!;
  const popupMessages = popup.querySelector<HTMLElement>('.conversation-popup-messages')!;
  const closePopup = () => { popup.hidden = true; };
  popup.querySelector<HTMLButtonElement>('.conversation-popup-close')!.addEventListener('click', closePopup);
  popup.addEventListener('click', event => { if (event.target === popup) closePopup(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !popup.hidden) closePopup(); });
  let activeName: string | null = null;
  let open = false;
  let latestCards: HTMLElement[] = [];
  let conversations = new Map<string, HTMLElement[]>();

  const drawFolders = () => {
    count.textContent = String(conversations.size);
    folderList.innerHTML = [...conversations.entries()].map(([name, cards]) =>
      `<button type="button" class="conversation-folder${activeName === name ? ' active' : ''}" data-conversation-name="${escapeAttribute(name)}"><span class="folder-glyph">▰</span><span class="conversation-folder-name">${escapeHtml(name)}</span><span class="conversation-folder-count">${cards.length}</span></button>`
    ).join('') || '<p class="dim folder-empty">Todavía no hablaste con nadie.</p>';
  };

  const renderActive = () => {
    target.textContent = activeName ? 'ARCHIVO · ' + activeName.toLocaleUpperCase('es') : 'CANAL ABIERTO · PERSONAS CERCANAS';
    if (activeName && conversations.has(activeName) && !popup.hidden) {
      popupTitle.textContent = activeName;
      popupMessages.innerHTML = (conversations.get(activeName) ?? []).map(card => card.outerHTML).join('');
    }
    drawFolders();
  };

  const refresh = () => {
    latestCards = [...feed.querySelectorAll<HTMLElement>('.dialogue-card')];
    const parsed = latestCards.map(card => ({card, player: card.classList.contains('player-line'), speaker: card.querySelector('.dialogue-speaker')?.textContent?.trim() ?? 'Interferencia'}));
    const next = new Map<string, HTMLElement[]>();
    let pendingPlayerCards: HTMLElement[] = [];
    let lastNpc: string | null = null;
    for (const item of parsed) {
      if (item.player) {
        pendingPlayerCards.push(item.card);
        continue;
      }
      if (item.speaker.toLocaleLowerCase('es') === 'interferencia') continue;
      if (!next.has(item.speaker)) next.set(item.speaker, []);
      const bucket = next.get(item.speaker)!;
      bucket.push(...pendingPlayerCards, item.card);
      pendingPlayerCards = [];
      lastNpc = item.speaker;
    }
    if (lastNpc && pendingPlayerCards.length) next.get(lastNpc)?.push(...pendingPlayerCards);
    for (const [name, cards] of next) {
      const existing = conversations.get(name) ?? [];
      const known = new Set(existing.map(card => card.outerHTML));
      conversations.set(name, [...existing, ...cards.filter(card => !known.has(card.outerHTML))]);
    }
    if (activeName && !conversations.has(activeName)) activeName = null;
    renderActive();
  };

  toggle.addEventListener('click', () => {
    open = !open;
    folderList.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    chevron.textContent = open ? '▾' : '▸';
  });
  folderList.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-conversation-name]');
    if (!button) return;
    const name = button.dataset.conversationName;
    if (!name) return;
    activeName = name;
    popupTitle.textContent = name;
    popupMessages.innerHTML = (conversations.get(name) ?? []).map(card => card.outerHTML).join('');
    popup.hidden = false;
    renderActive();
  });
  new MutationObserver(refresh).observe(feed, {childList: true, subtree: true, characterData: true});
  refresh();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] ?? char));
}
function escapeAttribute(value: string) { return escapeHtml(value); }
