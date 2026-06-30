import { SpineInstance, applyPose, slotNames } from './spineTypes';

declare const PIXI: {
  Graphics: new () => SlotGraphics;
};

type SlotGraphics = {
  clear: () => void;
  beginFill: (color: number, alpha?: number) => void;
  drawCircle: (x: number, y: number, radius: number) => void;
  endFill: () => void;
  lineStyle: (width: number, color: number, alpha?: number) => void;
};

export type SlotsPanel = {
  refresh: () => void;
  dispose: () => void;
};

export function createSlotsPanel(
  getSpine: () => SpineInstance,
  container: HTMLElement,
  ticker: { add: (fn: () => void) => void; remove: (fn: () => void) => void }
): SlotsPanel {
  const section = document.createElement('div');
  section.className = 'panel-section';

  const title = document.createElement('h3');
  title.className = 'section-title';
  title.innerText = 'Slots';
  section.appendChild(title);

  const list = document.createElement('div');
  list.className = 'slots-list';
  section.appendChild(list);
  container.appendChild(section);

  const markers = new PIXI.Graphics();
  let markersAttached = false;
  let activeSlot: string | null = null;

  const drawMarker = () => {
    const spine = getSpine();
    markers.clear();

    if (!activeSlot) {
      return;
    }

    const slot = spine.skeleton.slots.find((s) => s.data.name === activeSlot);
    if (!slot) {
      return;
    }

    spine.skeleton.updateWorldTransform();
    const x = slot.bone.worldX;
    const y = slot.bone.worldY;

    markers.lineStyle(2, 0xffffff, 1);
    markers.drawCircle(x, y, 12);
    markers.beginFill(0xff2222, 1);
    markers.drawCircle(x, y, 7);
    markers.endFill();
  };

  const refresh = () => {
    const spine = getSpine();
    if (markers.parent) {
      markers.parent.removeChild(markers);
      markersAttached = false;
    }
    spine.addChild(markers);
    markersAttached = true;

    list.innerHTML = '';
    activeSlot = null;
    markers.clear();

    for (const name of slotNames(spine)) {
      const row = document.createElement('div');
      row.className = 'option-row slot-row';
      list.appendChild(row);

      const label = document.createElement('span');
      label.className = 'slot-name';
      label.innerText = name;
      row.appendChild(label);

      row.onclick = () => {
        if (activeSlot === name) {
          activeSlot = null;
          row.classList.remove('slot-selected');
          markers.clear();
          return;
        }

        activeSlot = name;
        list.querySelectorAll('.slot-row').forEach((el) => el.classList.remove('slot-selected'));
        row.classList.add('slot-selected');
        applyPose(spine);
        drawMarker();
      };
    }
  };

  const onTick = () => {
    if (activeSlot) {
      drawMarker();
    }
  };

  ticker.add(onTick);

  return {
    refresh,
    dispose: () => {
      ticker.remove(onTick);
      if (markers.parent) {
        markers.parent.removeChild(markers);
      }
      markersAttached = false;
      section.remove();
    },
  };
}
