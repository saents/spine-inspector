import {
  SpineInstance,
  SpineTrackEntry,
  animationEvents,
  animationNames,
  applyPose,
  ensureTrackEntry,
  setTrackTime,
  trackDuration,
  trackProgress,
} from './spineTypes';

type Ticker = {
  add: (fn: () => void) => void;
  remove: (fn: () => void) => void;
};

type TrackSnapshot = {
  animationName: string;
  loop: boolean;
  progress: number;
  playing: boolean;
};

type TrackRow = {
  index: number;
  root: HTMLDivElement;
  select: HTMLSelectElement;
  loopInput: HTMLInputElement;
  playToggleBtn: HTMLButtonElement;
  bar: HTMLDivElement;
  fill: HTMLDivElement;
  head: HTMLDivElement;
  eventsLayer: HTMLDivElement;
  timeLabel: HTMLSpanElement;
  scrubbing: boolean;
};

export type Timeline = {
  mount: (container: HTMLElement) => void;
  refresh: () => void;
  dispose: () => void;
};

export function createTimeline(getSpine: () => SpineInstance, ticker: Ticker): Timeline {
  const rows: TrackRow[] = [];
  let container: HTMLElement | null = null;
  let trackList: HTMLDivElement | null = null;
  let eventTooltip: HTMLDivElement | null = null;

  const showEventTooltip = (name: string, anchor: DOMRect) => {
    if (!eventTooltip) {
      return;
    }
    eventTooltip.textContent = name;
    eventTooltip.classList.add('visible');
    const width = eventTooltip.offsetWidth;
    const height = eventTooltip.offsetHeight;
    eventTooltip.style.left = `${anchor.left - width - 6}px`;
    eventTooltip.style.top = `${anchor.top + anchor.height / 2 - height / 2}px`;
  };

  const hideEventTooltip = () => {
    eventTooltip?.classList.remove('visible');
  };

  const getAnimDuration = (animationName: string): number => {
    if (!animationName) {
      return 0;
    }
    const anim = getSpine().skeleton.data.findAnimation(animationName);
    return anim?.duration ?? 0;
  };

  const tick = () => {
    for (const row of rows) {
      if (row.scrubbing) {
        continue;
      }

      const entry = getSpine().state.getCurrent(row.index);
      if (!entry) {
        updateRowVisual(row, null, row.select.value);
        continue;
      }

      if (!entry.loop && entry.timeScale > 0) {
        const duration = trackDuration(entry);
        if (entry.trackTime >= duration || entry.isComplete?.()) {
          entry.trackTime = duration;
          entry.timeScale = 0;
        }
      }

      updateRowVisual(row, entry, row.select.value);
    }
  };

  const refresh = () => {
    const names = animationNames(getSpine());
    for (const row of rows) {
      fillAnimationSelect(row.select, names, row.select.value);
      renderEventMarkers(row, row.select.value);
      updateRowVisual(row, getSpine().state.getCurrent(row.index), row.select.value);
    }
  };

  const pauseAt = (row: TrackRow, progress: number) => {
    const name = row.select.value;
    if (!name) {
      return;
    }

    const spine = getSpine();
    const entry = ensureTrackEntry(spine, row.index, name, row.loopInput.checked);
    if (!entry) {
      return;
    }

    entry.timeScale = 0;
    setTrackTime(entry, progress);
    applyPose(spine);
    updateRowVisual(row, entry, name);
  };

  const syncPlayToggle = (row: TrackRow) => {
    const entry = getSpine().state.getCurrent(row.index);
    const playing = Boolean(entry && entry.timeScale > 0);
    row.playToggleBtn.innerText = playing ? 'Stop' : 'Play';
    row.playToggleBtn.classList.toggle('track-btn-playing', playing);
  };

  const togglePlayTrack = (row: TrackRow) => {
    const entry = getSpine().state.getCurrent(row.index);
    if (entry && entry.timeScale > 0) {
      stopTrack(row);
    } else {
      playTrack(row);
    }
    syncPlayToggle(row);
  };

  const playTrack = (row: TrackRow) => {
    const name = row.select.value;
    if (!name) {
      return;
    }

    const spine = getSpine();
    const loop = row.loopInput.checked;
    let entry = spine.state.getCurrent(row.index);

    if (!entry || entry.animation.name !== name || entry.loop !== loop) {
      entry = spine.state.setAnimation(row.index, name, loop);
    } else if (!loop) {
      const duration = trackDuration(entry);
      if (entry.trackTime >= duration || entry.isComplete?.()) {
        entry.trackTime = 0;
      }
    }

    entry.timeScale = 1;
    applyPose(spine);
    updateRowVisual(row, entry, name);
  };

  const stopTrack = (row: TrackRow) => {
    const entry = getSpine().state.getCurrent(row.index);
    if (!entry) {
      return;
    }
    entry.timeScale = 0;
    applyPose(getSpine());
    updateRowVisual(row, entry, row.select.value);
  };

  const resetTrack = (row: TrackRow) => {
    pauseAt(row, 0);
  };

  const scrubTrack = (row: TrackRow, clientX: number) => {
    const rect = row.bar.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, rect.width ? (clientX - rect.left) / rect.width : 0));
    pauseAt(row, progress);
  };

  const captureRows = (): TrackSnapshot[] =>
    rows.map((row) => {
      const entry = getSpine().state.getCurrent(row.index);
      return {
        animationName: row.select.value,
        loop: row.loopInput.checked,
        progress: entry ? trackProgress(entry) : 0,
        playing: entry ? entry.timeScale > 0 : false,
      };
    });

  const restoreRows = (snapshots: TrackSnapshot[]) => {
    getSpine().state.clearTracks();
    rows.forEach((row) => row.root.remove());
    rows.length = 0;

    snapshots.forEach((snapshot, index) => {
      addTrackRow(index);
      const row = rows[index];
      row.select.value = snapshot.animationName;
      row.loopInput.checked = snapshot.loop;
      renderEventMarkers(row, snapshot.animationName);

      if (snapshot.animationName) {
        pauseAt(row, snapshot.progress);
        if (snapshot.playing) {
          const entry = getSpine().state.getCurrent(index);
          if (entry) {
            entry.timeScale = 1;
          }
        }
      }
    });
  };

  const deleteTrackRow = (row: TrackRow) => {
    if (rows.length <= 1) {
      return;
    }
    restoreRows(captureRows().filter((_, i) => rows[i] !== row));
  };

  const addTrackRow = (index: number) => {
    if (!trackList) {
      return;
    }

    const row: TrackRow = {
      index,
      root: document.createElement('div'),
      select: document.createElement('select'),
      loopInput: document.createElement('input'),
      playToggleBtn: document.createElement('button'),
      bar: document.createElement('div'),
      fill: document.createElement('div'),
      head: document.createElement('div'),
      eventsLayer: document.createElement('div'),
      timeLabel: document.createElement('span'),
      scrubbing: false,
    };

    row.root.className = 'track-row';
    row.select.className = 'track-select';

    const label = document.createElement('span');
    label.className = 'track-label';
    label.innerText = `Track ${index}`;

    row.loopInput.type = 'checkbox';
    row.loopInput.id = `track-loop-${index}`;
    const loopLabel = document.createElement('label');
    loopLabel.htmlFor = `track-loop-${index}`;
    loopLabel.innerText = 'Loop';
    loopLabel.className = 'track-loop-label';

    row.select.onchange = () => {
      getSpine().state.clearTrack(row.index);
      renderEventMarkers(row, row.select.value);
      if (row.select.value) {
        pauseAt(row, 0);
      } else {
        updateRowVisual(row, null, '');
      }
      syncPlayToggle(row);
    };

    const playToggleBtn = button('Play', () => togglePlayTrack(row));
    playToggleBtn.classList.add('track-btn-play-toggle');

    const resetBtn = button('Reset', () => resetTrack(row));
    const deleteBtn = button('Delete', () => deleteTrackRow(row));
    deleteBtn.classList.add('track-btn-danger');

    const controls = document.createElement('div');
    controls.className = 'track-controls';
    controls.append(label, row.select, row.loopInput, loopLabel, playToggleBtn, resetBtn, deleteBtn);

    row.playToggleBtn = playToggleBtn;

    row.bar.className = 'track-bar';
    row.fill.className = 'track-fill';
    row.head.className = 'track-head';
    row.eventsLayer.className = 'track-events';
    row.timeLabel.className = 'track-time';
    row.bar.append(row.fill, row.head, row.eventsLayer, row.timeLabel);

    row.bar.onmousedown = (event) => {
      if (event.target instanceof HTMLElement && event.target.classList.contains('track-event')) {
        return;
      }
      row.scrubbing = true;
      scrubTrack(row, event.clientX);
      const onMove = (moveEvent: MouseEvent) => scrubTrack(row, moveEvent.clientX);
      const onUp = () => {
        row.scrubbing = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    row.root.append(controls, row.bar);
    trackList.appendChild(row.root);
    rows.push(row);
    fillAnimationSelect(row.select, animationNames(getSpine()), '');
    renderEventMarkers(row, '');
    updateRowVisual(row, null, '');
  };

  const renderEventMarkers = (row: TrackRow, animationName: string) => {
    row.eventsLayer.innerHTML = '';
    const duration = getAnimDuration(animationName);
    if (!animationName || duration <= 0) {
      return;
    }

    for (const event of animationEvents(getSpine(), animationName)) {
      const marker = document.createElement('span');
      marker.className = 'track-event';
      marker.style.left = `${(event.time / duration) * 100}%`;
      const showTip = () => showEventTooltip(event.name, marker.getBoundingClientRect());
      marker.onmouseenter = showTip;
      marker.onmouseleave = () => hideEventTooltip();
      marker.onmousemove = showTip;
      row.eventsLayer.appendChild(marker);
    }
  };

  const updateRowVisual = (row: TrackRow, entry: SpineTrackEntry | null, animationName: string) => {
    const duration = entry ? trackDuration(entry) : getAnimDuration(animationName);

    if (!entry && !animationName) {
      row.fill.style.width = '0%';
      row.head.style.left = '0%';
      row.timeLabel.innerText = '—';
      row.root.classList.remove('track-active');
      syncPlayToggle(row);
      return;
    }

    const progress = entry ? trackProgress(entry) : 0;
    const current = entry
      ? entry.loop
        ? entry.trackTime % (duration || 1)
        : entry.trackTime
      : 0;
    const name = entry?.animation.name ?? animationName;

    row.fill.style.width = `${progress * 100}%`;
    row.head.style.left = `${progress * 100}%`;
    row.timeLabel.innerText =
      duration > 0 ? `${current.toFixed(2)}s / ${duration.toFixed(2)}s · ${name}` : name;
    row.root.classList.add('track-active');
    syncPlayToggle(row);
  };

  return {
    mount(parent) {
      container = parent;
      container.innerHTML = '';

      eventTooltip = document.createElement('div');
      eventTooltip.className = 'event-tooltip';
      document.body.appendChild(eventTooltip);

      const header = document.createElement('div');
      header.className = 'timeline-header';

      const title = document.createElement('h3');
      title.className = 'section-title';
      title.innerText = 'Tracks';

      const addBtn = button('+ Track', () => addTrackRow(rows.length));
      const stopAllBtn = button('Stop all', () => {
        getSpine().state.clearTracks();
        for (const row of rows) {
          updateRowVisual(row, null, row.select.value);
        }
      });

      header.append(title, addBtn, stopAllBtn);

      trackList = document.createElement('div');
      trackList.className = 'track-list';

      container.append(header, trackList);
      addTrackRow(0);

      ticker.add(tick);
    },
    refresh,
    dispose() {
      ticker.remove(tick);
      eventTooltip?.remove();
      eventTooltip = null;
      rows.length = 0;
      container = null;
      trackList = null;
    },
  };
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'track-btn';
  btn.innerText = label;
  btn.onclick = onClick;
  return btn;
}

function fillAnimationSelect(select: HTMLSelectElement, names: string[], current: string): void {
  select.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.innerText = '— animation —';
  select.appendChild(empty);
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    option.innerText = name;
    select.appendChild(option);
  }
  select.value = names.includes(current) ? current : '';
}
