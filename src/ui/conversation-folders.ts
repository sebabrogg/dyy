const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function initConversationFolders() {
  const feed = byId<HTMLElement>('dialogue-feed');
  const toggle = byId<HTMLButtonElement>('conversation-folder-toggle');
  const folderList = byId<HTMLElement>('conversation-folders');
  const count = byId<HTMLElement>('conversation-folder-count');
  const chevron = byId<HTMLElement>('conversation-folder-chevron');
  const target = byId<HTMLElement>('conversation-target');
  const archiveView = byId<HTMLElement>('conversation-archive-view');
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
    if (activeName && conversations.has(activeName)) {
      feed.hidden = true;
      archiveView.hidden = false;
      archiveView.innerHTML = (conversations.get(activeName) ?? []).map(card => card.outerHTML).join('');
      target.textContent = 'ARCHIVO · ' + activeName.toLocaleUpperCase('es');
    } else {
      activeName = null;
      archiveView.hidden = true;
      feed.hidden = false;
      target.textContent = 'CANAL ABIERTO · PERSONAS CERCANAS';
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
    conversations = next;
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
    activeName = activeName === name ? null : name;
    renderActive();
  });
  new MutationObserver(refresh).observe(feed, {childList: true, subtree: true, characterData: true});
  refresh();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] ?? char));
}
function escapeAttribute(value: string) { return escapeHtml(value); }
