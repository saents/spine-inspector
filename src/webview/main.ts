import { createTimeline } from './timeline';
import { createSlotsPanel } from './slots';
import { InitMessage, SpineInstance } from './spineTypes';

declare const PIXI: {
  Application: new (options: Record<string, unknown>) => PixiApp;
  spine: { Spine: new (spineData: unknown) => SpineInstance };
};

type PixiApp = {
  view: HTMLCanvasElement;
  stage: { addChild: (child: SpineInstance) => void };
  loader: PixiLoader;
  ticker: { add: (fn: () => void) => void; remove: (fn: () => void) => void };
  start: () => void;
};

type PixiLoader = {
  add: (name: string, url: string, options?: Record<string, unknown>) => void;
  onError: { add: (fn: (error: unknown, loader: unknown, resource: { name: string }) => void) => void };
  load: (fn: (loader: unknown, resources: Record<string, { spineData: unknown }>) => void) => void;
};

type VsCodeApi = {
  postMessage: (message: { type: string; message?: string }) => void;
};

declare function acquireVsCodeApi(): VsCodeApi;

declare global {
  interface Window {
    __SPINE_INIT__?: InitMessage;
  }
}

const vscode = acquireVsCodeApi();

const initData = window.__SPINE_INIT__;
if (initData) {
  try {
    startViewer(initData);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showBootError(`Spine Inspector failed to start: ${message}`);
  }
} else {
  showBootError('Spine Inspector failed to start: missing init data.');
}

function showBootError(message: string): void {
  document.body.innerHTML = `<p style="padding:16px;color:#f88;font-family:sans-serif;">${message}</p>`;
  vscode.postMessage({ type: 'error', message });
}

function startViewer(data: InitMessage): void {
  if (typeof PIXI === 'undefined' || !PIXI.spine) {
    showBootError('Spine Inspector failed to start: Pixi libraries did not load.');
    return;
  }

  const spineNames = data.spines;
  let currentSpineIndex = 0;
  let spines: SpineInstance[] = [];
  let timeline: ReturnType<typeof createTimeline> | null = null;
  let slotsPanel: ReturnType<typeof createSlotsPanel> | null = null;

  const app = new PIXI.Application({
    width: 1440,
    height: 810,
    autoScale: true,
    backgroundColor: 0x000000,
  });

  const appHost = document.getElementById('app')!;
  const mainColumn = document.createElement('div');
  mainColumn.className = 'main-column';
  appHost.parentElement!.insertBefore(mainColumn, appHost);
  mainColumn.appendChild(appHost);
  appHost.appendChild(app.view);

  const timelineHost = document.createElement('div');
  timelineHost.className = 'timeline-panel';
  mainColumn.appendChild(timelineHost);

  const lists = document.createElement('div');
  lists.classList.add('lists');
  document.body.insertBefore(lists, mainColumn);

  const spinesSection = document.createElement('div');
  spinesSection.classList.add('panel-section');

  const spinesTitle = document.createElement('h3');
  spinesTitle.classList.add('section-title');
  spinesTitle.innerText = 'Spines';
  spinesSection.appendChild(spinesTitle);

  const spinesDiv = document.createElement('div');
  spinesDiv.classList.add('spines');
  spinesSection.appendChild(spinesDiv);
  lists.appendChild(spinesSection);

  const slotsHost = document.createElement('div');
  lists.appendChild(slotsHost);

  const switchSpine = (index: number) => {
    spines[currentSpineIndex].state.clearTracks();
    spines[currentSpineIndex].visible = false;
    currentSpineIndex = index;
    spines[currentSpineIndex].visible = true;
    slotsPanel?.refresh();
    timeline?.refresh();
  };

  spineNames.forEach((name, i) => {
    const row = document.createElement('div');
    row.classList.add('option-row');
    spinesDiv.appendChild(row);

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'spines';
    input.value = String(i);
    input.id = `spines_${name}`;
    row.appendChild(input);

    const label = document.createElement('label');
    label.htmlFor = `spines_${name}`;
    label.innerText = name;
    row.appendChild(label);

    input.onclick = () => switchSpine(i);

    if (i === 0) {
      input.checked = true;
    }
  });

  const loaderOption = {
    metadata: {
      spineAtlasFile: data.assets.atlas,
      imageNamePrefix: 'a_',
    },
  };

  for (const name of spineNames) {
    app.loader.add(name, data.assets.json[name], loaderOption);
  }

  app.loader.onError.add((_error, _loader, resource) => {
    vscode.postMessage({ type: 'error', message: `Failed to load: ${resource.name}` });
  });

  app.loader.load((_loader, resources) => {
    spines = spineNames.map((name) => {
      const spine = new PIXI.spine.Spine(resources[name].spineData);
      app.stage.addChild(spine);
      spine.x = app.view.width / 2;
      spine.y = app.view.height / 2;
      spine.visible = false;
      spine.scale.x = 1;
      return spine;
    });

    spines[currentSpineIndex].visible = true;

    const getSpine = () => spines[currentSpineIndex];
    slotsPanel = createSlotsPanel(getSpine, slotsHost, app.ticker);
    slotsPanel.refresh();

    timeline = createTimeline(getSpine, app.ticker);
    timeline.mount(timelineHost);
    timeline.refresh();

    app.start();
  });
}
