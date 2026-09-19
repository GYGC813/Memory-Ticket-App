/**
 * MEMORY TICKET APP v2.0 - CORE APPLICATION LOGIC
 * Features:
 * - Live Camera Viewfinder with Shutter Capture
 * - Dark & Light Mode Theme Engine with Persistence
 * - Multi-Photo Carousel per Ticket Stub
 * - Timeline View & Month/Year Grouping
 * - Real-time Search & Category Tag Filtering
 * - Long-Press Context Menu & Undo Snackbar
 * - Full JSON Backup & Restore (Export/Import)
 * - Instagram/Journaling Caption Generator
 * - Batch PNG Download as ZIP
 * - Ticket Dispenser Print Animation
 */

(function () {
  'use strict';

  // --- Storage Keys ---
  const STORAGE_KEY = 'memtix_tickets_v2';
  const ACTIVE_ID_KEY = 'memtix_active_id_v2';
  const THEME_KEY = 'memtix_theme_v2';
  const VIEW_MODE_KEY = 'memtix_view_mode_v2';

  // --- DOM Selector ---
  const $ = (id) => document.getElementById(id);

  // --- Categories Metadata ---
  const CATEGORIES = {
    travel: { label: 'Travel', icon: '✈️' },
    food: { label: 'Food', icon: '🍜' },
    concert: { label: 'Concert', icon: '🎵' },
    everyday: { label: 'Everyday', icon: '✨' },
    nature: { label: 'Nature', icon: '🌿' },
    party: { label: 'Party', icon: '🎉' }
  };

  // --- Preset Memories ---
  const PRESETS = {
    ghibli: {
      title: 'Ghibli Park',
      location: 'Nagakute',
      date: '2025-05-08',
      quote: "howl's moving castle!",
      category: 'travel',
      photos: ['assets/ghibli_park.jpg']
    },
    kyoto: {
      title: 'Arashiyama Grove',
      location: 'Kyoto',
      date: '2025-04-12',
      quote: 'whispering bamboo in morning mist',
      category: 'nature',
      photos: ['https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800&q=80']
    },
    paris: {
      title: 'Cafe de Flore',
      location: 'Paris',
      date: '2024-10-22',
      quote: 'croissants, espresso and autumn rain',
      category: 'food',
      photos: ['https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80']
    },
    sunset: {
      title: 'Big Sur Coastline',
      location: 'California',
      date: '2024-08-19',
      quote: 'golden hour over the pacific ocean',
      category: 'everyday',
      photos: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80']
    }
  };

  // --- State Variables ---
  let tickets = [];
  let activeTicketId = null;
  let activePhotoIndex = 0;
  let currentTheme = 'dark';
  let currentViewMode = 'grid'; // 'grid' | 'timeline'
  let sortDescending = true; // newest first
  let selectedCategoryFilter = 'all';
  let searchQuery = '';

  // Bottom Sheet Form State
  let editingTicketId = null;
  let sheetPhotos = [];
  let sheetCategory = 'travel';

  // Camera State
  let cameraStream = null;
  let cameraFacing = 'environment'; // 'environment' | 'user'

  // Undo Delete State
  let lastDeletedTicket = null;
  let lastDeletedIndex = -1;
  let undoTimer = null;

  // Context Menu State
  let contextTargetTicket = null;

  // --- Date Formatting Helpers ---
  function formatDate(isoStr) {
    if (!isoStr) return '—';
    return isoStr.replace(/-/g, '.');
  }

  function getMonthYearLabel(isoStr) {
    if (!isoStr) return 'MEMORIES';
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return 'MEMORIES';
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  }

  function generateTicketSerial(ticket) {
    const cleanDate = (ticket.date || '2025-01-01').replace(/-/g, '');
    const shortId = (ticket.id || '').slice(-4).toUpperCase();
    return `#MT-${cleanDate}`;
  }

  function generateBarcodeText(ticket) {
    const cleanDate = (ticket.date || '2025-01-01').replace(/-/g, '');
    const shortId = (ticket.id || '').slice(-4).toUpperCase();
    return `*MT-${cleanDate}-${shortId}*`;
  }

  // --- Local Storage Management ---
  function loadTicketsFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('memtix_tickets_v1');
      if (data) {
        const parsed = JSON.parse(data);
        // Normalize tickets to v2 schema (photos array, category)
        tickets = parsed.map(t => {
          const photos = t.photos && Array.isArray(t.photos) && t.photos.length > 0 
            ? t.photos 
            : (t.photo ? [t.photo] : [PRESETS.ghibli.photos[0]]);
          return {
            id: t.id || 't_' + Date.now(),
            title: t.title || 'Untitled Memory',
            location: t.location || '',
            date: t.date || new Date().toISOString().slice(0, 10),
            quote: t.quote || '',
            category: t.category || 'travel',
            photos: photos,
            createdAt: t.createdAt || Date.now()
          };
        });
      }
    } catch (e) {
      console.warn('Error reading from localStorage', e);
      tickets = [];
    }

    // Seed default Ghibli Park ticket if empty
    if (!tickets || tickets.length === 0) {
      const defaultStub = {
        id: 't_ghibli_' + Date.now(),
        title: PRESETS.ghibli.title,
        location: PRESETS.ghibli.location,
        date: PRESETS.ghibli.date,
        quote: PRESETS.ghibli.quote,
        category: PRESETS.ghibli.category,
        photos: [...PRESETS.ghibli.photos],
        createdAt: Date.now()
      };
      tickets = [defaultStub];
      saveTicketsToStorage();
    }

    const savedActiveId = localStorage.getItem(ACTIVE_ID_KEY);
    if (savedActiveId && tickets.some(t => t.id === savedActiveId)) {
      activeTicketId = savedActiveId;
    } else {
      activeTicketId = tickets[0].id;
    }

    // Load theme
    currentTheme = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(currentTheme);

    // Load view mode
    currentViewMode = localStorage.getItem(VIEW_MODE_KEY) || 'grid';
    updateViewModeUI();
  }

  function saveTicketsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
      if (activeTicketId) {
        localStorage.setItem(ACTIVE_ID_KEY, activeTicketId);
      }
    } catch (e) {
      console.error('LocalStorage quota error', e);
      showToast('Storage full! Delete old tickets or reduce photo sizes.');
    }
  }

  // --- Theme Engine ---
  function applyTheme(theme) {
    currentTheme = theme;
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add('theme-' + theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  $('btnThemeToggle').addEventListener('click', () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    showToast(`${nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1)} Mode activated`);
  });

  // --- Escape HTML ---
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- View Switching ---
  function showView(viewId) {
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    const target = $(viewId);
    if (target) {
      target.classList.add('active');
    }
    $('dropdownMenu').classList.remove('open');
  }

  // --- Render Active Ticket Stub Detail View ---
  function renderDetailView(triggerAnimation = false) {
    const ticket = tickets.find(t => t.id === activeTicketId) || tickets[0];
    if (!ticket) {
      showView('galleryView');
      renderGallery();
      return;
    }

    activeTicketId = ticket.id;
    localStorage.setItem(ACTIVE_ID_KEY, activeTicketId);

    // Text & Meta
    $('ticketTitle').textContent = ticket.title || 'Untitled Memory';
    $('ticketLoc').textContent = ticket.location || '—';
    $('ticketDate').textContent = formatDate(ticket.date);
    $('ticketQuote').textContent = ticket.quote || 'a line to remember it by';

    // Category Badge
    const cat = CATEGORIES[ticket.category] || CATEGORIES.travel;
    $('ticketCatIcon').textContent = cat.icon;
    $('ticketCatLabel').textContent = cat.label;

    // Serial & Barcode
    $('ticketSerialBadge').textContent = generateTicketSerial(ticket);
    $('barcodeText').textContent = generateBarcodeText(ticket);

    // Multi-Photo Carousel Rendering
    const photos = ticket.photos && ticket.photos.length > 0 ? ticket.photos : [PRESETS.ghibli.photos[0]];
    if (activePhotoIndex >= photos.length) activePhotoIndex = 0;

    const slidesContainer = $('photoSlidesContainer');
    slidesContainer.innerHTML = `<img id="ticketPhoto" src="${photos[activePhotoIndex]}" alt="${escapeHtml(ticket.title)}" />`;

    const prevBtn = $('btnPrevPhoto');
    const nextBtn = $('btnNextPhoto');
    const dotsWrap = $('photoDotsWrap');

    if (photos.length > 1) {
      prevBtn.style.display = 'flex';
      nextBtn.style.display = 'flex';
      dotsWrap.style.display = 'flex';

      dotsWrap.innerHTML = photos.map((_, i) => 
        `<span class="photo-dot ${i === activePhotoIndex ? 'active' : ''}" data-idx="${i}"></span>`
      ).join('');
    } else {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
      dotsWrap.style.display = 'none';
    }

    // Print dispenser animation
    if (triggerAnimation) {
      const wrapper = $('ticketWrapper');
      wrapper.classList.remove('ticket-printing');
      void wrapper.offsetWidth; // force reflow
      wrapper.classList.add('ticket-printing');
      if (navigator.vibrate) navigator.vibrate([40, 20, 60]);
    }
  }

  // --- Photo Carousel Navigation ---
  $('btnPrevPhoto').addEventListener('click', (e) => {
    e.stopPropagation();
    const ticket = tickets.find(t => t.id === activeTicketId);
    if (!ticket || !ticket.photos || ticket.photos.length <= 1) return;
    activePhotoIndex = (activePhotoIndex - 1 + ticket.photos.length) % ticket.photos.length;
    renderDetailView();
  });

  $('btnNextPhoto').addEventListener('click', (e) => {
    e.stopPropagation();
    const ticket = tickets.find(t => t.id === activeTicketId);
    if (!ticket || !ticket.photos || ticket.photos.length <= 1) return;
    activePhotoIndex = (activePhotoIndex + 1) % ticket.photos.length;
    renderDetailView();
  });

  // Touch Swipe for Photo Box
  let touchStartX = 0;
  $('ticketPhotoBox').addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  $('ticketPhotoBox').addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const diff = touchEndX - touchStartX;
    if (Math.abs(diff) > 40) {
      const ticket = tickets.find(t => t.id === activeTicketId);
      if (!ticket || !ticket.photos || ticket.photos.length <= 1) return;
      if (diff < 0) {
        // swipe left -> next
        activePhotoIndex = (activePhotoIndex + 1) % ticket.photos.length;
      } else {
        // swipe right -> prev
        activePhotoIndex = (activePhotoIndex - 1 + ticket.photos.length) % ticket.photos.length;
      }
      renderDetailView();
    }
  }, { passive: true });

  // --- Gallery Filtering & Sorting ---
  function getFilteredTickets() {
    let list = [...tickets];

    // Category filter
    if (selectedCategoryFilter !== 'all') {
      list = list.filter(t => (t.category || 'travel') === selectedCategoryFilter);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.location && t.location.toLowerCase().includes(q)) ||
        (t.quote && t.quote.toLowerCase().includes(q))
      );
    }

    // Date sorting
    list.sort((a, b) => {
      const da = new Date(a.date || 0).getTime();
      const db = new Date(b.date || 0).getTime();
      return sortDescending ? (db - da) : (da - db);
    });

    return list;
  }

  // --- Render Gallery & Timeline Views ---
  function renderGallery() {
    const filtered = getFilteredTickets();
    const grid = $('ticketGrid');
    const timeline = $('ticketTimeline');
    const emptyState = $('emptyState');
    const countLabel = $('galleryCount');

    countLabel.textContent = `${tickets.length} saved`;

    if (filtered.length === 0) {
      emptyState.style.display = 'flex';
      grid.style.display = 'none';
      timeline.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';

    if (currentViewMode === 'grid') {
      grid.style.display = 'grid';
      timeline.style.display = 'none';
      renderGridView(filtered, grid);
    } else {
      grid.style.display = 'none';
      timeline.style.display = 'block';
      renderTimelineView(filtered, timeline);
    }
  }

  // Render 2-Column Grid
  function renderGridView(list, container) {
    container.innerHTML = '';
    list.forEach(ticket => {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      const cat = CATEGORIES[ticket.category] || CATEGORIES.travel;
      const photoSrc = (ticket.photos && ticket.photos[0]) || PRESETS.ghibli.photos[0];
      const count = (ticket.photos && ticket.photos.length) || 1;

      card.innerHTML = `
        <div class="gallery-card-thumb">
          <img src="${photoSrc}" alt="${escapeHtml(ticket.title)}" loading="lazy" />
          <span class="card-cat-badge">${cat.icon} ${cat.label}</span>
          ${count > 1 ? `<span class="card-photos-count">📷 ${count}</span>` : ''}
        </div>
        <div class="gallery-card-info">
          <h3 class="gallery-card-title">${escapeHtml(ticket.title)}</h3>
          <p class="gallery-card-meta">📍 ${escapeHtml(ticket.location || '—')} · ${formatDate(ticket.date)}</p>
        </div>
      `;

      // Tap to view
      card.addEventListener('click', () => {
        activeTicketId = ticket.id;
        activePhotoIndex = 0;
        renderDetailView();
        showView('detailView');
      });

      // Long press for context actions
      attachLongPressListener(card, ticket);

      container.appendChild(card);
    });
  }

  // Render Chronological Timeline View
  function renderTimelineView(list, container) {
    container.innerHTML = '';

    // Group by Month & Year
    const groups = {};
    list.forEach(ticket => {
      const key = getMonthYearLabel(ticket.date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(ticket);
    });

    Object.keys(groups).forEach(groupKey => {
      const groupItems = groups[groupKey];
      const groupWrap = document.createElement('div');
      groupWrap.className = 'timeline-group';

      groupWrap.innerHTML = `
        <div class="timeline-header">
          <span class="timeline-title">${groupKey}</span>
          <span class="timeline-count-pill">${groupItems.length}</span>
        </div>
        <div class="timeline-list"></div>
      `;

      const listContainer = groupWrap.querySelector('.timeline-list');
      groupItems.forEach(ticket => {
        const itemCard = document.createElement('div');
        itemCard.className = 'timeline-item-card';
        const photoSrc = (ticket.photos && ticket.photos[0]) || PRESETS.ghibli.photos[0];

        itemCard.innerHTML = `
          <div class="timeline-thumb">
            <img src="${photoSrc}" alt="${escapeHtml(ticket.title)}" loading="lazy" />
          </div>
          <div class="timeline-info">
            <h4 class="timeline-item-title">${escapeHtml(ticket.title)}</h4>
            <p class="timeline-item-meta">📍 ${escapeHtml(ticket.location || '—')} · ${formatDate(ticket.date)}</p>
            ${ticket.quote ? `<p class="timeline-item-quote">"${escapeHtml(ticket.quote)}"</p>` : ''}
          </div>
        `;

        itemCard.addEventListener('click', () => {
          activeTicketId = ticket.id;
          activePhotoIndex = 0;
          renderDetailView();
          showView('detailView');
        });

        attachLongPressListener(itemCard, ticket);
        listContainer.appendChild(itemCard);
      });

      container.appendChild(groupWrap);
    });
  }

  // View Mode Toggle (Grid vs Timeline)
  function updateViewModeUI() {
    $('viewModeIcon').textContent = currentViewMode === 'grid' ? '📅' : '⊞';
    $('viewModeLabel').textContent = currentViewMode === 'grid' ? 'Timeline' : 'Grid';
  }

  $('btnViewToggle').addEventListener('click', () => {
    currentViewMode = currentViewMode === 'grid' ? 'timeline' : 'grid';
    localStorage.setItem(VIEW_MODE_KEY, currentViewMode);
    updateViewModeUI();
    renderGallery();
  });

  // Sort Toggle (Newest vs Oldest)
  $('btnSortToggle').addEventListener('click', () => {
    sortDescending = !sortDescending;
    $('sortIcon').textContent = sortDescending ? '⇅' : '⇵';
    renderGallery();
    showToast(sortDescending ? 'Sorted: Newest first' : 'Sorted: Oldest first');
  });

  // Search Input Handlers
  $('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    $('btnClearSearch').style.display = searchQuery ? 'block' : 'none';
    renderGallery();
  });

  $('btnClearSearch').addEventListener('click', () => {
    $('searchInput').value = '';
    searchQuery = '';
    $('btnClearSearch').style.display = 'none';
    renderGallery();
  });

  // Category Filter Chips Handlers
  document.querySelectorAll('.cat-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.cat-filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedCategoryFilter = chip.dataset.category;
      renderGallery();
    });
  });

  // --- Long-Press Context Menu ---
  function attachLongPressListener(element, ticket) {
    let pressTimer = null;

    const start = (e) => {
      pressTimer = setTimeout(() => {
        openContextMenu(ticket);
      }, 550);
    };

    const cancel = () => {
      if (pressTimer) clearTimeout(pressTimer);
    };

    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchend', cancel);
    element.addEventListener('touchmove', cancel);
    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(ticket);
    });
  }

  function openContextMenu(ticket) {
    contextTargetTicket = ticket;
    $('contextCardTitle').textContent = ticket.title;
    $('contextCardMeta').textContent = `📍 ${ticket.location || '—'} · ${formatDate(ticket.date)}`;
    $('contextModal').classList.add('open');
    if (navigator.vibrate) navigator.vibrate(35);
  }

  function closeContextMenu() {
    $('contextModal').classList.remove('open');
    contextTargetTicket = null;
  }

  $('contextModal').addEventListener('click', (e) => {
    if (e.target === $('contextModal')) closeContextMenu();
  });

  $('contextBtnView').addEventListener('click', () => {
    if (!contextTargetTicket) return;
    activeTicketId = contextTargetTicket.id;
    activePhotoIndex = 0;
    renderDetailView();
    closeContextMenu();
    showView('detailView');
  });

  $('contextBtnEdit').addEventListener('click', () => {
    if (!contextTargetTicket) return;
    const t = contextTargetTicket;
    closeContextMenu();
    openSheet(t);
  });

  $('contextBtnDuplicate').addEventListener('click', () => {
    if (!contextTargetTicket) return;
    duplicateTicket(contextTargetTicket);
    closeContextMenu();
  });

  $('contextBtnCaption').addEventListener('click', () => {
    if (!contextTargetTicket) return;
    copySocialCaption(contextTargetTicket);
    closeContextMenu();
  });

  $('contextBtnDownload').addEventListener('click', () => {
    if (!contextTargetTicket) return;
    activeTicketId = contextTargetTicket.id;
    renderDetailView();
    closeContextMenu();
    showView('detailView');
    setTimeout(() => $('btnDownload').click(), 300);
  });

  $('contextBtnDelete').addEventListener('click', () => {
    if (!contextTargetTicket) return;
    const t = contextTargetTicket;
    closeContextMenu();
    deleteTicket(t);
  });

  // --- Duplicate Ticket Function ---
  function duplicateTicket(target) {
    const dup = {
      ...target,
      id: 't_' + Date.now(),
      title: `${target.title} (Copy)`,
      photos: [...(target.photos || [])],
      createdAt: Date.now()
    };
    tickets.unshift(dup);
    activeTicketId = dup.id;
    saveTicketsToStorage();
    renderGallery();
    showToast('Stub duplicated!');
  }

  // --- Delete Ticket & Undo Snackbar ---
  function deleteTicket(ticketToDelete) {
    lastDeletedIndex = tickets.findIndex(t => t.id === ticketToDelete.id);
    lastDeletedTicket = ticketToDelete;

    tickets = tickets.filter(t => t.id !== ticketToDelete.id);
    if (tickets.length > 0) {
      activeTicketId = tickets[0].id;
    } else {
      activeTicketId = null;
    }

    saveTicketsToStorage();
    renderDetailView();
    renderGallery();

    // Show Undo Snackbar
    const snackbar = $('undoSnackbar');
    $('undoSnackbarText').textContent = `"${ticketToDelete.title}" deleted`;
    snackbar.classList.add('show');

    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      snackbar.classList.remove('show');
      lastDeletedTicket = null;
    }, 4500);
  }

  $('btnUndoDelete').addEventListener('click', () => {
    if (!lastDeletedTicket) return;
    if (lastDeletedIndex >= 0 && lastDeletedIndex <= tickets.length) {
      tickets.splice(lastDeletedIndex, 0, lastDeletedTicket);
    } else {
      tickets.unshift(lastDeletedTicket);
    }
    activeTicketId = lastDeletedTicket.id;
    saveTicketsToStorage();
    renderDetailView();
    renderGallery();

    $('undoSnackbar').classList.remove('show');
    lastDeletedTicket = null;
    showToast('Ticket restored!');
  });

  // --- Social Caption Generator ---
  function copySocialCaption(ticket) {
    const cat = CATEGORIES[ticket.category] || CATEGORIES.travel;
    const tag = ticket.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const caption = 
`🎟️ Memory Ticket: ${ticket.title}
📍 ${ticket.location || 'Unknown'} · 📅 ${formatDate(ticket.date)}
Tag: ${cat.icon} #${ticket.category}

"${ticket.quote || 'a memory worth keeping'}"

✨ Preserved with Memory Tickets App
#memories #travelgram #${tag} #keepsake #ticketstub`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(caption).then(() => {
        showToast('Caption copied to clipboard! 📋');
      });
    } else {
      showToast('Caption ready!');
    }
  }

  $('menuShareCaption').addEventListener('click', () => {
    $('dropdownMenu').classList.remove('open');
    const current = tickets.find(t => t.id === activeTicketId);
    if (current) copySocialCaption(current);
  });

  // --- LIVE CAMERA FILTERS & CONTROLLER ---
  const CAMERA_FILTERS = [
    { id: 'normal', name: 'Original', filter: 'none', icon: '✨' },
    { id: 'vintage', name: 'Vintage', filter: 'sepia(0.42) contrast(1.15) brightness(0.96) saturate(1.2)', icon: '🎞️' },
    { id: 'noir', name: 'Noir B&W', filter: 'grayscale(1) contrast(1.3) brightness(0.92)', icon: '🖤' },
    { id: 'warm', name: 'Warm Sunset', filter: 'sepia(0.28) saturate(1.65) hue-rotate(-12deg) contrast(1.08)', icon: '🌅' },
    { id: 'cool', name: 'Cool Mist', filter: 'contrast(1.08) saturate(0.88) hue-rotate(185deg) brightness(1.04)', icon: '🌊' },
    { id: 'vivid', name: 'Vivid Pop', filter: 'saturate(1.8) contrast(1.16) brightness(1.02)', icon: '🎨' },
    { id: 'polaroid', name: '90s Film', filter: 'contrast(0.9) brightness(1.12) saturate(0.8) sepia(0.22)', icon: '📼' },
    { id: 'emerald', name: 'Emerald', filter: 'hue-rotate(60deg) saturate(1.25) contrast(1.1)', icon: '🌿' },
    { id: 'cyber', name: 'Cyberpunk', filter: 'contrast(1.32) saturate(1.9) hue-rotate(275deg)', icon: '⚡' }
  ];

  let currentCameraFilter = CAMERA_FILTERS[0];
  let filterBannerTimer = null;

  function showCameraFilterBanner(text) {
    const banner = $('cameraFilterBanner');
    if (!banner) return;
    banner.textContent = text;
    banner.classList.add('show');
    if (filterBannerTimer) clearTimeout(filterBannerTimer);
    filterBannerTimer = setTimeout(() => {
      banner.classList.remove('show');
    }, 1500);
  }

  function setCameraFilter(filter) {
    currentCameraFilter = filter;
    const video = $('cameraVideo');
    if (video) {
      video.style.filter = filter.filter;
    }

    // Update active UI chips
    document.querySelectorAll('.camera-filter-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.filterId === filter.id);
    });

    showCameraFilterBanner(`${filter.icon} ${filter.name}`);
  }

  function initCameraFiltersUI() {
    const tray = $('cameraFiltersTray');
    if (!tray) return;
    tray.innerHTML = '';

    CAMERA_FILTERS.forEach(f => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `camera-filter-chip ${f.id === currentCameraFilter.id ? 'active' : ''}`;
      chip.dataset.filterId = f.id;
      chip.setAttribute('aria-label', f.name);
      chip.innerHTML = `
        <div class="filter-chip-preview" style="filter: ${f.filter};">${f.icon}</div>
        <span class="filter-chip-name">${f.name}</span>
      `;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        setCameraFilter(f);
      });
      tray.appendChild(chip);
    });
  }

  async function openLiveCamera(forDrawer = false) {
    const modal = $('cameraModal');
    const video = $('cameraVideo');
    modal.classList.add('open');

    // Setup filter tray and restore chosen filter
    initCameraFiltersUI();
    setCameraFilter(currentCameraFilter);

    // Mirror video preview when using front camera
    video.classList.toggle('mirrored', cameraFacing === 'user');

    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
      }
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      video.srcObject = cameraStream;
    } catch (err) {
      console.warn('Camera access error:', err);
      showToast('Could not access camera. Try file upload.');
      closeLiveCamera();
      if (!forDrawer) openSheet(null);
    }
  }

  function closeLiveCamera() {
    $('cameraModal').classList.remove('open');
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
  }

  $('btnCloseCamera').addEventListener('click', closeLiveCamera);

  $('btnFlipCamera').addEventListener('click', () => {
    cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    const video = $('cameraVideo');
    if (video) {
      video.classList.toggle('mirrored', cameraFacing === 'user');
    }
    openLiveCamera();
  });

  const btnToggleGrid = $('btnToggleGrid');
  if (btnToggleGrid) {
    btnToggleGrid.addEventListener('click', () => {
      const grid = $('cameraGrid');
      if (grid) {
        grid.classList.toggle('grid-hidden');
      }
    });
  }

  const btnResetFilter = $('btnResetFilter');
  if (btnResetFilter) {
    btnResetFilter.addEventListener('click', () => {
      setCameraFilter(CAMERA_FILTERS[0]);
    });
  }

  $('btnShutter').addEventListener('click', () => {
    const video = $('cameraVideo');
    const canvas = $('cameraCaptureCanvas');
    const flash = $('cameraFlash');

    // Trigger flash animation
    flash.classList.add('flash-active');
    setTimeout(() => flash.classList.remove('flash-active'), 150);

    if (navigator.vibrate) navigator.vibrate([30, 40]);

    canvas.width = video.videoWidth || 800;
    canvas.height = video.videoHeight || 600;
    const ctx = canvas.getContext('2d');

    // Apply active filter to the captured canvas photo
    if (currentCameraFilter && currentCameraFilter.filter && currentCameraFilter.filter !== 'none') {
      ctx.filter = currentCameraFilter.filter;
    } else {
      ctx.filter = 'none';
    }

    if (cameraFacing === 'user') {
      // Mirror front camera capture to match preview
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const snappedPhoto = canvas.toDataURL('image/jpeg', 0.88);
    closeLiveCamera();

    // Check if bottom sheet was already open
    const isSheetOpen = $('sheetOverlay').classList.contains('open');
    if (isSheetOpen) {
      if (sheetPhotos.length < 4) {
        sheetPhotos.push(snappedPhoto);
        renderSheetPhotosUI();
      } else {
        showToast('Max 4 photos per ticket.');
      }
    } else {
      // Open new ticket drawer with this photo
      openSheet(null, [snappedPhoto]);
    }
  });

  // Direct Camera Trigger Buttons
  $('btnHeaderCamera').addEventListener('click', () => openLiveCamera(false));
  $('btnFabCamera').addEventListener('click', () => openLiveCamera(false));
  $('btnSheetCamera').addEventListener('click', () => openLiveCamera(true));
  $('menuLiveCamera').addEventListener('click', () => {
    $('dropdownMenu').classList.remove('open');
    openLiveCamera(false);
  });

  // Fallback Camera File Input
  $('cameraFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    processImageFile(file, (dataUrl) => {
      closeLiveCamera();
      openSheet(null, [dataUrl]);
    });
  });

  // --- EDIT & CREATE BOTTOM SHEET DRAWER ---
  function openSheet(ticketToEdit = null, initialPhotos = null) {
    editingTicketId = ticketToEdit ? ticketToEdit.id : null;
    $('formError').style.display = 'none';

    if (ticketToEdit) {
      $('sheetTitle').textContent = 'Edit Ticket';
      $('inputTitle').value = ticketToEdit.title || '';
      $('inputLoc').value = ticketToEdit.location || '';
      $('inputDate').value = ticketToEdit.date || '';
      $('inputQuote').value = ticketToEdit.quote || '';
      sheetCategory = ticketToEdit.category || 'travel';
      sheetPhotos = ticketToEdit.photos && ticketToEdit.photos.length > 0 
        ? [...ticketToEdit.photos] 
        : [PRESETS.ghibli.photos[0]];
    } else {
      $('sheetTitle').textContent = 'New Memory Ticket';
      $('inputTitle').value = '';
      $('inputLoc').value = '';
      $('inputDate').value = new Date().toISOString().slice(0, 10);
      $('inputQuote').value = '';
      sheetCategory = 'travel';
      sheetPhotos = initialPhotos || [PRESETS.ghibli.photos[0]];
    }

    // Category Selector
    document.querySelectorAll('.sheet-cat-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.cat === sheetCategory);
    });

    renderSheetPhotosUI();
    $('sheetOverlay').classList.add('open');
    setTimeout(() => $('inputTitle').focus(), 150);
  }

  function closeSheet() {
    $('sheetOverlay').classList.remove('open');
    $('formError').style.display = 'none';
    editingTicketId = null;
    sheetPhotos = [];
  }

  // Category Selector in Sheet
  document.querySelectorAll('.sheet-cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.sheet-cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      sheetCategory = chip.dataset.cat;
    });
  });

  // Render Multi-Photos list in Drawer
  function renderSheetPhotosUI() {
    const list = $('multiPhotosList');
    const countText = $('photosCountText');
    countText.textContent = `${sheetPhotos.length} / 4 photos`;

    list.innerHTML = '';

    sheetPhotos.forEach((photo, idx) => {
      const item = document.createElement('div');
      item.className = 'photo-thumb-item';
      item.innerHTML = `
        <img src="${photo}" alt="Photo ${idx + 1}" />
        <button type="button" class="photo-thumb-del" data-idx="${idx}" title="Remove photo">✕</button>
      `;
      list.appendChild(item);
    });

    // Delete photo button
    list.querySelectorAll('.photo-thumb-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        sheetPhotos.splice(idx, 1);
        if (sheetPhotos.length === 0) {
          sheetPhotos = [PRESETS.ghibli.photos[0]];
        }
        renderSheetPhotosUI();
      });
    });

    // Add photo tile (if < 4)
    if (sheetPhotos.length < 4) {
      const addTile = document.createElement('button');
      addTile.type = 'button';
      addTile.className = 'add-photo-btn';
      addTile.innerHTML = `
        <span class="add-photo-plus">+</span>
        <span class="add-photo-text">Add</span>
      `;
      addTile.addEventListener('click', () => $('sheetFileInput').click());
      list.appendChild(addTile);
    }
  }

  // Image Processing & Compression Helper
  function processImageFile(file, callback) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 850;
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  $('sheetFileInput').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.slice(0, 4 - sheetPhotos.length).forEach(file => {
      processImageFile(file, (dataUrl) => {
        if (sheetPhotos.length < 4) {
          sheetPhotos.push(dataUrl);
          renderSheetPhotosUI();
        }
      });
    });
    e.target.value = '';
  });

  // Preset Chips
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const preset = PRESETS[chip.dataset.preset];
      if (!preset) return;
      $('inputTitle').value = preset.title;
      $('inputLoc').value = preset.location;
      $('inputDate').value = preset.date;
      $('inputQuote').value = preset.quote;
      sheetCategory = preset.category;
      sheetPhotos = [...preset.photos];

      document.querySelectorAll('.sheet-cat-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.cat === sheetCategory);
      });

      renderSheetPhotosUI();
    });
  });

  // Save Ticket
  $('btnSaveTicket').addEventListener('click', () => {
    const title = $('inputTitle').value.trim();
    if (!title) {
      const err = $('formError');
      err.textContent = 'Please give your memory a title.';
      err.style.display = 'block';
      $('inputTitle').focus();
      return;
    }

    const location = $('inputLoc').value.trim();
    const date = $('inputDate').value || new Date().toISOString().slice(0, 10);
    const quote = $('inputQuote').value.trim();
    const photos = sheetPhotos.length > 0 ? sheetPhotos : [PRESETS.ghibli.photos[0]];

    if (editingTicketId) {
      const idx = tickets.findIndex(t => t.id === editingTicketId);
      if (idx !== -1) {
        tickets[idx] = {
          ...tickets[idx],
          title,
          location,
          date,
          quote,
          category: sheetCategory,
          photos: [...photos],
          updatedAt: Date.now()
        };
        activeTicketId = editingTicketId;
      }
      saveTicketsToStorage();
      renderDetailView(false);
      renderGallery();
      closeSheet();
      showToast('Ticket updated!');
    } else {
      const newTicket = {
        id: 't_' + Date.now(),
        title,
        location,
        date,
        quote,
        category: sheetCategory,
        photos: [...photos],
        createdAt: Date.now()
      };
      tickets.unshift(newTicket);
      activeTicketId = newTicket.id;
      activePhotoIndex = 0;
      saveTicketsToStorage();
      renderDetailView(true); // Trigger ticket printed animation!
      renderGallery();
      closeSheet();
      showView('detailView');
      showToast('🎟️ Ticket printed & saved!');
    }
  });

  // --- DOWNLOAD SINGLE TICKET (PNG) ---
  $('btnDownload').addEventListener('click', async () => {
    const ticketCard = $('ticketCard');
    showToast('Printing high-res ticket PNG...');

    try {
      const bg = currentTheme === 'dark' ? '#0d0d11' : '#F6F1E7';
      const canvas = await html2canvas(ticketCard, {
        backgroundColor: bg,
        scale: 3,
        useCORS: true,
        logging: false
      });

      const title = $('ticketTitle').textContent.trim() || 'memory-ticket';
      const cleanFileName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-stub.png';

      const link = document.createElement('a');
      link.download = cleanFileName;
      link.href = canvas.toDataURL('image/png');
      link.click();

      showToast('Saved to photos! ✨');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Could not export image. Please try again.');
    }
  });

  // --- SHARE TICKET ---
  $('btnShare').addEventListener('click', async () => {
    const title = $('ticketTitle').textContent.trim() || 'Memory Ticket';
    const loc = $('ticketLoc').textContent.trim();
    const date = $('ticketDate').textContent.trim();
    const quote = $('ticketQuote').textContent.trim();
    const shareText = `🎟️ Memory Ticket: ${title}\n📍 ${loc} · 📅 ${date}\n"${quote}"`;

    if (navigator.share) {
      try {
        const bg = currentTheme === 'dark' ? '#0d0d11' : '#F6F1E7';
        const canvas = await html2canvas($('ticketCard'), { backgroundColor: bg, scale: 2, useCORS: true });
        canvas.toBlob(async (blob) => {
          if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], 'ticket.png', { type: 'image/png' })] })) {
            const file = new File([blob], `${title.toLowerCase().replace(/\s+/g, '-')}-ticket.png`, { type: 'image/png' });
            await navigator.share({
              title: `${title} - Memory Ticket`,
              text: shareText,
              files: [file]
            });
          } else {
            await navigator.share({
              title: `${title} - Memory Ticket`,
              text: shareText
            });
          }
          showToast('Shared successfully!');
        }, 'image/png');
      } catch (err) {
        if (err.name !== 'AbortError') console.warn('Share error:', err);
      }
    } else {
      copySocialCaption(tickets.find(t => t.id === activeTicketId) || tickets[0]);
    }
  });

  // --- BACKUP, RESTORE & BATCH ZIP DOWNLOAD ---
  $('btnOpenBackup').addEventListener('click', () => $('backupModal').classList.add('open'));
  $('menuDataBackup').addEventListener('click', () => {
    $('dropdownMenu').classList.remove('open');
    $('backupModal').classList.add('open');
  });
  $('btnCloseBackup').addEventListener('click', () => $('backupModal').classList.remove('open'));
  $('backupModal').addEventListener('click', (e) => {
    if (e.target === $('backupModal')) $('backupModal').classList.remove('open');
  });

  // 1. Export JSON Backup
  $('btnExportJSON').addEventListener('click', () => {
    const dataStr = JSON.stringify(tickets, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `memory-tickets-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    showToast('Backup JSON exported successfully!');
  });

  // 2. Import JSON Restore
  $('importJSONFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported) && imported.length > 0) {
          tickets = imported;
          activeTicketId = tickets[0].id;
          saveTicketsToStorage();
          renderDetailView();
          renderGallery();
          $('backupModal').classList.remove('open');
          showToast(`Successfully restored ${tickets.length} memory tickets! 🎉`);
        } else {
          showToast('Invalid backup file format.');
        }
      } catch (err) {
        showToast('Failed to parse backup JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // 3. Batch ZIP Export
  $('btnBatchDownload').addEventListener('click', async () => {
    if (typeof JSZip === 'undefined') {
      showToast('JSZip library loading, please try again.');
      return;
    }

    $('backupModal').classList.remove('open');
    showToast(`Generating ZIP for ${tickets.length} tickets... Please wait.`);

    const zip = new JSZip();
    const bg = currentTheme === 'dark' ? '#0d0d11' : '#F6F1E7';

    // Store original active ticket
    const originalActiveId = activeTicketId;

    for (let i = 0; i < tickets.length; i++) {
      activeTicketId = tickets[i].id;
      activePhotoIndex = 0;
      renderDetailView(false);

      // Brief pause to ensure image paint
      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas($('ticketCard'), {
        backgroundColor: bg,
        scale: 2,
        useCORS: true,
        logging: false
      });

      const base64Data = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      const fileName = `${String(i + 1).padStart(2, '0')}-${(tickets[i].title || 'ticket').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      zip.file(fileName, base64Data, { base64: true });
    }

    // Restore original active ticket
    activeTicketId = originalActiveId;
    renderDetailView(false);

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.download = `all-memory-tickets-${new Date().toISOString().slice(0, 10)}.zip`;
    link.href = URL.createObjectURL(content);
    link.click();

    showToast('Batch download complete! 📦');
  });

  // --- Header & Navigation Handlers ---
  $('btnBackToGallery').addEventListener('click', () => {
    renderGallery();
    showView('galleryView');
  });

  $('btnBackToDetail').addEventListener('click', () => {
    renderDetailView();
    showView('detailView');
  });

  $('btnEdit').addEventListener('click', () => {
    const current = tickets.find(t => t.id === activeTicketId);
    openSheet(current);
  });

  $('btnCloseSheet').addEventListener('click', closeSheet);
  $('btnCancelSheet').addEventListener('click', closeSheet);

  $('sheetOverlay').addEventListener('click', (e) => {
    if (e.target === $('sheetOverlay')) closeSheet();
  });

  $('btnFabCreate').addEventListener('click', () => openSheet(null));
  $('btnEmptyCreate').addEventListener('click', () => openSheet(null));

  // Three-dot Menu Handlers
  $('btnMenu').addEventListener('click', (e) => {
    e.stopPropagation();
    $('dropdownMenu').classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-wrap')) {
      $('dropdownMenu').classList.remove('open');
    }
  });

  $('menuNew').addEventListener('click', () => {
    $('dropdownMenu').classList.remove('open');
    openSheet(null);
  });

  $('menuGallery').addEventListener('click', () => {
    $('dropdownMenu').classList.remove('open');
    renderGallery();
    showView('galleryView');
  });

  $('menuDuplicate').addEventListener('click', () => {
    $('dropdownMenu').classList.remove('open');
    const current = tickets.find(t => t.id === activeTicketId);
    if (current) duplicateTicket(current);
  });

  $('menuDelete').addEventListener('click', () => {
    $('dropdownMenu').classList.remove('open');
    const current = tickets.find(t => t.id === activeTicketId);
    if (current) deleteTicket(current);
  });

  // Desktop Frame Toggle
  $('btnFrameToggle').addEventListener('click', () => {
    const container = $('deviceContainer');
    const isFullscreen = container.classList.toggle('fullscreen-mode');
    $('btnFrameToggle').querySelector('.toggle-label').textContent = isFullscreen ? 'Phone Frame' : 'Full Screen';
  });

  // Toast Notification
  let toastTimer = null;
  function showToast(msg) {
    const toast = $('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  // Live Status Clock (safe check)
  function updateClock() {
    const el = $('statusTime');
    if (!el) return;
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    hours = hours % 12 || 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    el.textContent = `${hours}:${minutes}`;
  }
  updateClock();
  setInterval(updateClock, 30000);

  // Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  // --- Initial Boot ---
  loadTicketsFromStorage();
  renderDetailView(false);
  renderGallery();

})();
