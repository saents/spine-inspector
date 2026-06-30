export type SpineEvent = {
  time: number;
  name: string;
};

export type SpineTrackEntry = {
  trackTime: number;
  animationStart: number;
  animationEnd: number;
  loop: boolean;
  timeScale: number;
  animation: { name: string; duration: number; timelines: unknown[] };
  isComplete?: () => boolean;
};

export type SpineAnimationData = {
  name: string;
  duration: number;
  timelines: unknown[];
};

export type SpineState = {
  setAnimation: (track: number, name: string, loop: boolean) => SpineTrackEntry;
  clearTrack: (track: number) => void;
  clearTracks: () => void;
  getCurrent: (track: number) => SpineTrackEntry | null;
  update: (delta: number) => void;
  apply: (skeleton: SpineSkeleton) => void;
  timeScale: number;
};

export type SpineSlot = {
  data: { name: string };
  bone: { worldX: number; worldY: number };
};

export type SpineSkeleton = {
  data: {
    findAnimation: (name: string) => SpineAnimationData | null;
  };
  slots: SpineSlot[];
  updateWorldTransform: () => void;
};

export type SpineInstance = {
  x: number;
  y: number;
  visible: boolean;
  scale: { x: number };
  spineData: { animations: { name: string }[] };
  skeleton: SpineSkeleton;
  state: SpineState;
  addChild: (child: unknown) => void;
  removeChild: (child: unknown) => void;
};

export type InitMessage = {
  atlas: string;
  spines: string[];
  assets: {
    atlas: string;
    json: Record<string, string>;
  };
};

export function animationNames(spine: SpineInstance): string[] {
  return spine.spineData.animations.map((a) => a.name);
}

export function slotNames(spine: SpineInstance): string[] {
  return spine.skeleton.slots.map((s) => s.data.name);
}

export function trackDuration(entry: SpineTrackEntry): number {
  return entry.animationEnd - entry.animationStart;
}

export function trackProgress(entry: SpineTrackEntry): number {
  const duration = trackDuration(entry);
  if (duration <= 0) {
    return 0;
  }
  if (entry.loop) {
    return (entry.trackTime % duration) / duration;
  }
  return Math.min(entry.trackTime / duration, 1);
}

export function setTrackTime(entry: SpineTrackEntry, progress: number): void {
  const duration = trackDuration(entry);
  entry.trackTime = Math.max(0, Math.min(progress, 1)) * duration;
}

export function animationEvents(spine: SpineInstance, animationName: string): SpineEvent[] {
  const animation = spine.skeleton.data.findAnimation(animationName);
  if (!animation) {
    return [];
  }

  const events: SpineEvent[] = [];
  for (const timeline of animation.timelines) {
    const eventTimeline = timeline as { frames?: number[]; events?: { data: { name: string } }[] };
    if (!eventTimeline.frames || !eventTimeline.events) {
      continue;
    }
    for (let i = 0; i < eventTimeline.frames.length; i++) {
      events.push({
        time: eventTimeline.frames[i],
        name: eventTimeline.events[i].data.name,
      });
    }
  }

  return events.sort((a, b) => a.time - b.time);
}

export function applyPose(spine: SpineInstance): void {
  spine.state.update(0);
  spine.state.apply(spine.skeleton);
  spine.skeleton.updateWorldTransform();
}

export function ensureTrackEntry(
  spine: SpineInstance,
  trackIndex: number,
  animationName: string,
  loop: boolean
): SpineTrackEntry | null {
  if (!animationName) {
    return null;
  }

  let entry = spine.state.getCurrent(trackIndex);
  if (!entry || entry.animation.name !== animationName || entry.loop !== loop) {
    entry = spine.state.setAnimation(trackIndex, animationName, loop);
  }
  return entry;
}
