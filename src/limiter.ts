type CacheLike = {
  get: (key: string, fallback: unknown) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<unknown>;
};

type CreateLimiterDeps = {
  cache: CacheLike;
  toStringMap: (value: unknown) => Record<string, unknown>;
  isTaskGroupCancelled: (taskGroupKey: string) => Promise<boolean>;
  rateLimitWaitChunkMs: number;
  downloadCancelledMessage: string;
};

export function createRateLimiter(
  name: string,
  maxPerMinute: number,
  maxConcurrent: number,
  deps: CreateLimiterDeps,
) {
  const {
    cache,
    toStringMap,
    isTaskGroupCancelled,
    rateLimitWaitChunkMs,
    downloadCancelledMessage,
  } = deps;
  const queue: Array<{
    run: () => void;
    priority: number;
    taskGroupKey: string;
  }> = [];
  const timestamps: number[] = [];
  let running = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let minuteStartedAt = Date.now();
  let minutePassedCount = 0;
  const sharedWindowKey = `copyComic:rateWindow:v1:${name}`;
  let sharedRecentCount = 0;

  const rotateMinuteWindowIfNeeded = () => {
    const now = Date.now();
    if (now - minuteStartedAt < 60_000) return false;
    minuteStartedAt = now;
    minutePassedCount = 0;
    return true;
  };

  const logState = (event: string) => {
    const now = Date.now();
    rotateMinuteWindowIfNeeded();
    console.log(
      `[rate-limit:${name}] event=${event} tsMs=${now} minutePassed=${minutePassedCount} running=${running} queued=${queue.length} sharedRecent=${sharedRecentCount}/${maxPerMinute} maxConcurrent=${maxConcurrent}`,
    );
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) =>
      setTimeout(resolve, Math.max(1, Math.min(ms, rateLimitWaitChunkMs))),
    );

  const acquireSharedMinutePermit = async (taskGroupKey: string) => {
    for (;;) {
      if (taskGroupKey && (await isTaskGroupCancelled(taskGroupKey))) {
        throw new Error(downloadCancelledMessage);
      }
      const now = Date.now();
      const windowTimestamps: number[] = [];
      try {
        const raw = await cache.get(sharedWindowKey, null);
        const data = toStringMap(raw);
        if (Array.isArray(data.ts)) {
          windowTimestamps.push(...data.ts.map((n) => Number(n)).filter((n) => Number.isFinite(n)));
        }
      } catch {
        // ignore cache read errors
      }

      const valid = windowTimestamps.filter((t) => now - t < 60_000).sort((a, b) => a - b);
      sharedRecentCount = valid.length;
      if (valid.length < maxPerMinute) {
        valid.push(now);
        sharedRecentCount = valid.length;
        try {
          await cache.set(sharedWindowKey, { ts: valid });
        } catch {
          // ignore cache write errors
        }
        return;
      }

      const waitMs = Math.max(1, 60_000 - (now - valid[0]));
      logState(`shared_throttled_wait_${waitMs}ms`);
      await sleep(waitMs);
    }
  };

  const clearExpired = () => {
    const now = Date.now();
    while (timestamps.length > 0 && now - timestamps[0] >= 60_000) {
      timestamps.shift();
    }
  };

  const schedulePump = (waitMs: number) => {
    if (timer) return;
    timer = setTimeout(
      () => {
        timer = undefined;
        pump();
      },
      Math.max(1, waitMs),
    );
  };

  const pump = () => {
    rotateMinuteWindowIfNeeded();
    clearExpired();
    while (queue.length > 0 && running < maxConcurrent) {
      if (timestamps.length >= maxPerMinute) {
        const waitMs = Math.max(1, 60_000 - (Date.now() - timestamps[0]));
        logState(`throttled_wait_${waitMs}ms`);
        schedulePump(Math.min(waitMs, rateLimitWaitChunkMs));
        return;
      }
      const next = queue.shift();
      if (!next) break;
      running += 1;
      logState("dequeue_run");
      Promise.resolve()
        .then(async () => {
          if (next.taskGroupKey && (await isTaskGroupCancelled(next.taskGroupKey))) {
            throw new Error(downloadCancelledMessage);
          }
          await acquireSharedMinutePermit(next.taskGroupKey);
          timestamps.push(Date.now());
          minutePassedCount += 1;
          logState("permit_granted");
          next.run();
        })
        .catch(() => {
          running -= 1;
          pump();
        });
    }
  };

  return async function limit<T>(
    task: () => Promise<T>,
    options: { priority?: number; taskGroupKey?: string } = {},
  ): Promise<T> {
    const taskGroupKey = String(options.taskGroupKey ?? "").trim();
    if (taskGroupKey && (await isTaskGroupCancelled(taskGroupKey))) {
      throw new Error(downloadCancelledMessage);
    }
    return new Promise<T>((resolve, reject) => {
      logState("enqueue_before");
      const item = {
        priority: Number(options.priority ?? 1),
        taskGroupKey,
        run: () => {
          logState("task_start");
          task()
            .then(resolve, reject)
            .finally(() => {
              running -= 1;
              logState("task_end");
              pump();
            });
        },
      };
      if (item.priority <= 0) {
        queue.unshift(item);
      } else {
        queue.push(item);
      }
      logState("enqueue_after");
      pump();
    });
  };
}

export function createFetchImageDualLimiter(
  maxPriorityPerMinute: number,
  maxNormalPerMinute: number,
  maxConcurrent: number,
  deps: CreateLimiterDeps,
) {
  const {
    cache,
    toStringMap,
    isTaskGroupCancelled,
    rateLimitWaitChunkMs,
    downloadCancelledMessage,
  } = deps;
  const highWindowKey = "copyComic:rateWindow:v1:fetchImageBytes:high";
  const normalWindowKey = "copyComic:rateWindow:v1:fetchImageBytes:normal";
  const schedulerStateKey = "copyComic:rateState:v1:fetchImageBytes";
  const schedulerConfigKey = "copyComic:rateQueue:v1:fetchImageBytes:config";
  const demotedHighKey = "copyComic:rateState:v1:fetchImageBytes:demotedHigh";
  let taskSeq = 0;

  const persistSchedulerConfig = async () => {
    try {
      await cache.set(schedulerConfigKey, {
        maxPriorityPerMinute,
        maxNormalPerMinute,
        maxConcurrent,
      });
    } catch {}
  };

  const readDemotedHighIds = async () => {
    try {
      const raw = await cache.get(demotedHighKey, null);
      const data = toStringMap(raw);
      return Array.isArray(data.ids) ? data.ids.map((id) => String(id)).filter(Boolean) : [];
    } catch {
      return [];
    }
  };

  const writeDemotedHighIds = async (ids: string[]) => {
    try {
      await cache.set(demotedHighKey, { ts: Date.now(), ids });
    } catch {}
  };

  const addDemotedHighId = async (id: string) => {
    const ids = await readDemotedHighIds();
    if (ids.includes(id)) return;
    ids.push(id);
    await writeDemotedHighIds(ids);
  };

  const removeDemotedHighId = async (id: string) => {
    const ids = await readDemotedHighIds();
    const next = ids.filter((item) => item !== id);
    if (next.length !== ids.length) {
      await writeDemotedHighIds(next);
    }
  };

  const persistSchedulerState = async (reason: string, extra: Record<string, unknown> = {}) => {
    try {
      const demotedHighIds = await readDemotedHighIds();
      await cache.set(schedulerStateKey, {
        ts: Date.now(),
        reason,
        maxConcurrent,
        demotedHighCount: demotedHighIds.length,
        demotedHighIds,
        ...extra,
      });
    } catch {}
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) =>
      setTimeout(resolve, Math.max(1, Math.min(ms, rateLimitWaitChunkMs))),
    );

  const readTimestamps = async (key: string) => {
    const now = Date.now();
    try {
      const raw = await cache.get(key, null);
      const data = toStringMap(raw);
      return Array.isArray(data.ts)
        ? data.ts
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && now - n < 60_000)
            .sort((a, b) => a - b)
        : [];
    } catch {
      return [];
    }
  };

  const writeTimestamps = async (key: string, ts: number[]) => {
    try {
      await cache.set(key, { ts });
    } catch {}
  };

  const tryAcquireWindow = async (key: string, maxPerMinute: number, taskGroupKey: string) => {
    if (taskGroupKey && (await isTaskGroupCancelled(taskGroupKey))) {
      throw new Error(downloadCancelledMessage);
    }
    const now = Date.now();
    const valid = await readTimestamps(key);
    if (valid.length >= maxPerMinute) {
      const waitMs = Math.max(1, 60_000 - (now - valid[0]));
      return { ok: false as const, waitMs };
    }
    valid.push(now);
    await writeTimestamps(key, valid);
    return { ok: true as const, waitMs: 0 };
  };

  const getWaitMs = async (key: string) => {
    const now = Date.now();
    const valid = await readTimestamps(key);
    if (!valid.length) return 1;
    return Math.max(1, 60_000 - (now - valid[0]));
  };

  return async function limit<T extends Uint8Array>(
    task: () => Promise<T>,
    options: { priority?: number; taskGroupKey?: string } = {},
  ): Promise<T> {
    const taskGroupKey = String(options.taskGroupKey ?? "").trim();
    if (taskGroupKey && (await isTaskGroupCancelled(taskGroupKey))) {
      throw new Error(downloadCancelledMessage);
    }
    taskSeq += 1;
    const taskId = String(taskSeq);
    const isHighPriority = Number(options.priority ?? 1) === 0;

    await persistSchedulerConfig();
    await persistSchedulerState("enqueue", { taskId, isHighPriority, taskGroupKey });

    if (isHighPriority) {
      const highPermit = await tryAcquireWindow(highWindowKey, maxPriorityPerMinute, taskGroupKey);
      if (highPermit.ok) {
        await removeDemotedHighId(taskId);
        await persistSchedulerState("run_high", { taskId });
        return task();
      }
      await addDemotedHighId(taskId);
      await persistSchedulerState("demote_high_to_normal", { taskId });
    }

    for (;;) {
      const normalPermit = await tryAcquireWindow(
        normalWindowKey,
        maxNormalPerMinute,
        taskGroupKey,
      );
      if (normalPermit.ok) {
        if (isHighPriority) {
          await removeDemotedHighId(taskId);
          await persistSchedulerState("run_normal_demoted_high", { taskId });
        } else {
          await persistSchedulerState("run_normal", { taskId });
        }
        return task();
      }

      if (isHighPriority) {
        const highRetry = await tryAcquireWindow(highWindowKey, maxPriorityPerMinute, taskGroupKey);
        if (highRetry.ok) {
          await removeDemotedHighId(taskId);
          await persistSchedulerState("steal_back_to_high", { taskId });
          return task();
        }
      }

      const waitHigh = isHighPriority ? await getWaitMs(highWindowKey) : 60_000;
      const waitNormal = await getWaitMs(normalWindowKey);
      const waitMs = Math.min(waitHigh, waitNormal, rateLimitWaitChunkMs);
      await persistSchedulerState("wait", { taskId, waitMs });
      await sleep(waitMs);
    }
  };
}
