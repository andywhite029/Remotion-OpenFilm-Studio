// Timeline contract checker.
//
// `src/timeline.ts` is the film's single clock: every component derives its
// window from `SEG`, so a broken table breaks every shot at once. This script
// is the contract that table has to satisfy:
//
//   1. SEG is not empty.
//   2. Every beat is a half-open integer window `[from, to)` with at least one
//      frame.
//   3. `BEAT_IDS` lists exactly the keys of `SEG`, once each, in story order.
//   4. The beats are strictly ascending and never overlap. Gaps are allowed but
//      reported, because a hole between two beats is usually an accident.
//   5. `TIMELINE_END` is the end of the last beat.
//   6. `VIDEO.DURATION` covers the whole timeline (it may be longer: the tail is
//      free padding).
//
// Run it with `node tools/checkTimeline.ts` (Node strips the types natively, no
// build step) or as part of `npm run check`.
//
// Exit codes: 0 = the contract holds, 1 = at least one violation.

import {BEAT_IDS, SEG, TIMELINE_END, VIDEO} from '../src/timeline.ts';

type BeatId = keyof typeof SEG;

/** Lowercase words joined by single hyphens: `title`, `part-two`, `end-2`. */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Violations fail the check; notes are information that never changes the exit code. */
const problems: string[] = [];
const notes: string[] = [];

function problem(message: string): void {
  problems.push(message);
}

function note(message: string): void {
  notes.push(message);
}

// ---------------------------------------------------------------------------
// 1. The keys: non-empty, kebab-case, and BEAT_IDS mirrors them exactly.
// ---------------------------------------------------------------------------

const declared = Object.keys(SEG) as BeatId[];

if (declared.length === 0) {
  problem('SEG 为空：至少需要定义一个 beat');
}

const listed = [...BEAT_IDS];
const listedSet = new Set<string>();

for (const id of listed) {
  if (listedSet.has(id)) {
    problem(`BEAT_IDS 中 "${id}" 重复出现`);
  }
  listedSet.add(id);
  if (!(id in SEG)) {
    problem(`BEAT_IDS 列出了 SEG 中不存在的 beat "${id}"`);
  }
}

for (const id of declared) {
  if (!listedSet.has(id)) {
    problem(`BEAT_IDS 缺少 beat "${id}"：请按 story order 补上`);
  }
}

// ---------------------------------------------------------------------------
// 2. Story order: sorting by `from` must reproduce BEAT_IDS exactly.
// ---------------------------------------------------------------------------

const byStart = [...declared].sort((a, b) => SEG[a].from - SEG[b].from);

const sameOrder =
  listed.length === byStart.length &&
  listed.every((id, index) => id === byStart[index]);

if (!sameOrder) {
  const listedOrder = listed.join(' → ') || '(空)';
  const sortedOrder = byStart.join(' → ') || '(空)';
  problem(
    `BEAT_IDS 顺序与 SEG 中 from 升序不一致：\n` +
      `      BEAT_IDS: ${listedOrder}\n` +
      `      from 升序: ${sortedOrder}`,
  );
}

// ---------------------------------------------------------------------------
// 3. Each beat: integers, ascending, at least one frame, no overlap.
// ---------------------------------------------------------------------------

let previousId: BeatId | null = null;
let previousTo = 0;

for (const id of byStart) {
  const {from, to} = SEG[id];
  const label = `beat "${id}"`;

  if (!KEBAB_CASE.test(id)) {
    problem(`${label} 的 id 不是 kebab-case（小写字母/数字，用 - 连接）`);
  }

  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    problem(`${label} 的 from/to 必须是整数帧（当前 ${from}/${to}）`);
  }

  if (from < 0) {
    problem(`${label} 的 from 不能为负（当前 ${from}）`);
  }

  if (to <= from) {
    problem(`${label} 区间非法：to(${to}) 必须大于 from(${from})`);
  } else if (to - from < 1) {
    problem(`${label} 至少需要 1 帧（当前 ${to - from} 帧）`);
  }

  if (previousId === null) {
    if (from > 0) {
      note(`片头有 ${from} 帧空白（第一个 beat 从 ${from} 开始，若为刻意的停格可忽略）`);
    }
  } else if (from < previousTo) {
    problem(
      `${label} 与 "${previousId}" 重叠：from(${from}) < 上一个 beat 的 to(${previousTo})`,
    );
  } else if (from > previousTo) {
    note(`${label} 前有 ${from - previousTo} 帧空隙（若为刻意的停格可忽略）`);
  }

  if (to > previousTo) {
    previousTo = to;
  }
  previousId = id;
}

// ---------------------------------------------------------------------------
// 4. TIMELINE_END must be the end of the last beat, and VIDEO.DURATION must
//    cover it.
// ---------------------------------------------------------------------------

const expectedEnd =
  byStart.length > 0 ? Math.max(...byStart.map((id) => SEG[id].to)) : 0;

if (!Number.isInteger(TIMELINE_END)) {
  problem(`TIMELINE_END 必须是整数帧（当前 ${TIMELINE_END}）`);
}

if (TIMELINE_END !== expectedEnd) {
  problem(
    `TIMELINE_END(${TIMELINE_END}) 必须等于最后一个 beat 的 to(${expectedEnd})`,
  );
}

if (TIMELINE_END <= 0) {
  problem(`TIMELINE_END 必须为正数（当前 ${TIMELINE_END}）`);
}

if (VIDEO.DURATION < TIMELINE_END) {
  problem(
    `VIDEO.DURATION(${VIDEO.DURATION}) < TIMELINE_END(${TIMELINE_END})：` +
      `时间轴超出合成长度，尾部 beats 不会被渲染`,
  );
} else if (VIDEO.DURATION > TIMELINE_END) {
  note(
    `VIDEO.DURATION(${VIDEO.DURATION}) 比时间轴多 ${VIDEO.DURATION - TIMELINE_END} 帧结尾留白（允许）`,
  );
}

// A cheap sanity pass on the format itself: these numbers reach ffmpeg.
if (!(VIDEO.FPS > 0) || !Number.isInteger(VIDEO.FPS)) {
  problem(`VIDEO.FPS 必须是正整数（当前 ${VIDEO.FPS}）`);
}

for (const axis of ['WIDTH', 'HEIGHT'] as const) {
  const value = VIDEO[axis];
  if (!Number.isInteger(value) || value <= 0) {
    problem(`VIDEO.${axis} 必须是正整数（当前 ${value}）`);
  } else if (value % 2 !== 0) {
    note(`VIDEO.${axis}(${value}) 是奇数：H.264 的 yuv420p 需要偶数尺寸`);
  }
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

const covered = byStart.reduce(
  (total, id) => total + (SEG[id].to - SEG[id].from),
  0,
);

console.log('▶ 校验时间轴契约（src/timeline.ts）');
console.log(
  `  beats: ${declared.length} | TIMELINE_END: ${TIMELINE_END} | ` +
    `VIDEO: ${VIDEO.WIDTH}x${VIDEO.HEIGHT}@${VIDEO.FPS} | ` +
    `DURATION: ${VIDEO.DURATION}`,
);
console.log(
  `  覆盖: ${covered} 帧 = ${(covered / VIDEO.FPS).toFixed(2)}s` +
    `；结尾留白: ${Math.max(0, VIDEO.DURATION - covered)} 帧`,
);

for (const id of byStart) {
  const {from, to} = SEG[id];
  const seconds = ((to - from) / VIDEO.FPS).toFixed(2);
  console.log(
    `  ✓ ${id.padEnd(12)} [${String(from).padStart(4)}, ${String(to).padStart(4)})  ` +
      `${String(to - from).padStart(4)} 帧 / ${seconds}s`,
  );
}

for (const message of notes) {
  console.log(`  ! ${message}`);
}

for (const message of problems) {
  console.log(`  ✗ ${message}`);
}

if (problems.length > 0) {
  console.log(`\n✗ 失败：${problems.length} 项违反时间轴契约，${notes.length} 项提示`);
  process.exit(1);
}

console.log(
  `\n✓ 时间轴契约通过${notes.length > 0 ? `（${notes.length} 项提示）` : ''}`,
);
