// The demo film. This is the file to replace when you start a real project.
//
// Everything here is assembled from the template's parts:
//   timeline.ts   → which frames belong to which beat
//   theme.ts      → every colour, size and shadow
//   components/   → the atoms (motion, type, surfaces, cards, charts)
//
// Two structural rules are worth copying into your own film:
//
//   1. A beat is a *layer*, not a branch. `BeatLayer` mounts only the beats that
//      are on screen and cross-fades neighbours over the cut, so a beat never
//      has to know what comes after it.
//   2. Nothing in this file reads a clock or a random source. `frame` goes in,
//      pixels come out — that is what keeps a 10-minute render reproducible.

import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {type ReactNode} from 'react';
import {C, MOTION, SPACE} from '../theme';
import {BEAT_IDS, SEG, TIMELINE_END, VIDEO, type SegId} from '../timeline';
import {progress, timecode} from '../lib/format';
import {beatLength, stagger} from '../lib/motion';
import {Footer, Frame, Safe} from '../components/Frame';
import {FadeIn, SlideIn} from '../components/Motion';
import {
  Body,
  Display,
  H3,
  Lead,
  Micro,
  Mono,
  Small,
} from '../components/Typography';
import {Panel, Rule, Stat} from '../components/Surfaces';
import {BeatHeader, EndCard, LowerThird, TitleCard} from '../components/Cards';
import {BarRow, LineChart} from '../components/Chart';

/** Frames of cross-dissolve on each side of a beat boundary. */
const CROSS = 5;

/**
 * One beat's worth of screen. Fades in and out around its own window so
 * neighbouring beats hand over without a flash of empty ground.
 *
 * The first beat opens at full opacity and the last one fades to nothing by the
 * composition's final frame, so the film neither starts mid-fade nor stops
 * abruptly.
 */
const BeatLayer = ({id, children}: {id: SegId; children: ReactNode}) => {
  const frame = useCurrentFrame();
  const {from, to} = SEG[id];
  const isFirst = from === 0;
  const isLast = to === TIMELINE_END;

  const fadeIn = isFirst ? 1 : progress(frame, from - CROSS, from + CROSS);
  const fadeOut = isLast
    ? 1 - progress(frame, to - CROSS * 2, to)
    : 1 - progress(frame, to - CROSS, to + CROSS);
  const opacity = Math.max(0, Math.min(fadeIn, fadeOut));

  if (opacity <= 0.001) return null;

  return (
    <AbsoluteFill style={{opacity}}>
      <Safe>{children}</Safe>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Beat 1 — title
// ---------------------------------------------------------------------------

const TitleBeat = () => (
  <TitleCard
    start={SEG.title.from}
    kicker="REMOTION 4 · REACT THREE FIBER"
    title={
      <>
        把视频
        <br />
        写成代码
        <span style={{color: C.accent}}>。</span>
      </>
    }
    subtitle="一条时间轴、一套设计令牌、一批组件。改一个数字，整条片子跟着重排——成品是可复现的文件，不是又一次手动对齐。"
  />
);

// ---------------------------------------------------------------------------
// Beat 2 — one statement
// ---------------------------------------------------------------------------

const StatementBeat = () => {
  const start = SEG.statement.from;
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        maxWidth: 1440,
      }}
    >
      <SlideIn start={start + 2} distance={20} duration={MOTION.slow}>
        <Display style={{fontSize: 84}}>浅色不是反相。</Display>
      </SlideIn>
      <SlideIn
        start={start + stagger(2, 8)}
        distance={20}
        duration={MOTION.slow}
      >
        <Display style={{fontSize: 84, color: C.textSecondary}}>
          深度来自投影和细线，
          <br />
          不是发光。
        </Display>
      </SlideIn>
      <FadeIn start={start + stagger(4, 10)} duration={MOTION.base}>
        <Lead style={{marginTop: SPACE.xl, maxWidth: 980}}>
          这套模板里的 23 个语义令牌，就是为了让这条规则可以被强制执行：
          组件里没有裸颜色值，`npm run check` 会替你把对比度逐对算出来。
        </Lead>
      </FadeIn>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Beat 3 — numbers, read straight out of the shot list
// ---------------------------------------------------------------------------

const MetricsBeat = () => {
  const frame = useCurrentFrame();
  const start = SEG.metrics.from;
  const lengths = BEAT_IDS.map((id) => beatLength(id));
  const maxLength = Math.max(...lengths);

  // Cumulative end frame of each beat — the timeline's own profile, not
  // invented data. If a beat is retimed, this chart moves with it.
  const cumulative = BEAT_IDS.map((id) => SEG[id].to);

  return (
    <>
      <BeatHeader
        start={start}
        kicker="TIMELINE"
        title="时间轴是唯一事实源"
        meta={`${TIMELINE_END} 帧 · ${(TIMELINE_END / VIDEO.FPS).toFixed(1)} 秒 · ${VIDEO.FPS}fps`}
      />
      <div
        style={{
          display: 'flex',
          gap: SPACE.lg,
          marginTop: SPACE.lg,
          flex: 1,
          alignItems: 'stretch',
        }}
      >
        <SlideIn
          start={start + stagger(2, 8)}
          from="up"
          distance={22}
          style={{flex: 1.25, display: 'flex'}}
        >
          <Panel
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: SPACE.md,
            }}
          >
            <Small>每拍时长（帧）</Small>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                flex: 1,
              }}
            >
              {BEAT_IDS.map((id, i) => (
                <BarRow
                  key={id}
                  label={id}
                  value={lengths[i]}
                  max={maxLength}
                  reveal={progress(
                    frame,
                    start + stagger(4 + i, 5),
                    start + stagger(4 + i, 5) + MOTION.slow,
                  )}
                  valueLabel={`${lengths[i]}f`}
                />
              ))}
            </div>
            <Rule />
            <Micro>
              读自 src/timeline.ts —— 节拍一改，这张表和右边曲线同时变。
            </Micro>
          </Panel>
        </SlideIn>

        <SlideIn
          start={start + stagger(3, 8)}
          from="up"
          distance={22}
          style={{flex: 1, display: 'flex'}}
        >
          <Panel
            tone="alt"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: SPACE.md,
            }}
          >
            <div style={{display: 'flex', gap: SPACE.xl}}>
              <Stat label="节拍" value={String(BEAT_IDS.length)} unit="拍" />
              <Stat
                label="总长"
                value={(TIMELINE_END / VIDEO.FPS).toFixed(1)}
                unit="秒"
                emphasis
              />
              <Stat label="帧数" value={String(TIMELINE_END)} unit="f" />
            </div>
            <Rule />
            <Small>累计结束帧</Small>
            <LineChart
              values={cumulative}
              width={560}
              height={150}
              reveal={progress(
                frame,
                start + stagger(6, 10),
                start + stagger(6, 10) + MOTION.slow * 2,
              )}
            />
            <Micro>曲线的每个拐点就是一次切镜。</Micro>
          </Panel>
        </SlideIn>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Beat 4 — the method, as steps
// ---------------------------------------------------------------------------

const STEPS: ReadonlyArray<{title: string; body: string; cmd: string}> = [
  {
    title: '写脚本',
    body: '先把一句话写下来，再谈画面。没有能复述的论点，就没有片子。',
    cmd: 'docs/03-制作流程.md',
  },
  {
    title: '排时间轴',
    body: '在 timeline.ts 里给每个节拍分配帧，全片只认这一张表。',
    cmd: 'src/timeline.ts',
  },
  {
    title: '拼组件',
    body: '每拍只组合已有的原子，不为单帧新造样式或一次性组件。',
    cmd: 'src/components/',
  },
  {
    title: '校验出片',
    body: '先 check 再渲染；先静帧过一遍构图，最后才渲整片。',
    cmd: 'npm run check',
  },
];

const ProcessBeat = () => {
  const start = SEG.process.from;
  return (
    <>
      <BeatHeader
        start={start}
        kicker="WORKFLOW"
        title="四步，每一步都留下可复现的东西"
        meta="check → still → render"
      />
      <div style={{display: 'flex', marginTop: SPACE.xl, flex: 1}}>
        {STEPS.map((step, i) => {
          const stepStart = start + stagger(3 + i, 7);
          return (
            <div
              key={step.title}
              style={{
                flex: 1,
                paddingLeft: i === 0 ? 0 : SPACE.lg,
                paddingRight: i === STEPS.length - 1 ? 0 : SPACE.lg,
                borderLeft: i === 0 ? 'none' : `1px solid ${C.borderSubtle}`,
              }}
            >
              <FadeIn start={stepStart} duration={MOTION.fast}>
                <Mono style={{fontSize: 13, color: C.accent}}>
                  {String(i + 1).padStart(2, '0')}
                </Mono>
              </FadeIn>
              <SlideIn
                start={stepStart + 4}
                distance={16}
                duration={MOTION.base}
              >
                <H3 style={{marginTop: SPACE.sm}}>{step.title}</H3>
              </SlideIn>
              <FadeIn start={stepStart + 10} duration={MOTION.base}>
                <Body style={{marginTop: SPACE.sm, color: C.textSecondary}}>
                  {step.body}
                </Body>
              </FadeIn>
              <FadeIn start={stepStart + 16} duration={MOTION.fast}>
                <Micro style={{marginTop: SPACE.md}}>
                  <Mono style={{fontSize: 13, color: C.textTertiary}}>
                    {step.cmd}
                  </Mono>
                </Micro>
              </FadeIn>
            </div>
          );
        })}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Beat 5 — end
// ---------------------------------------------------------------------------

const EndBeat = () => (
  <EndCard
    start={SEG.end.from}
    title="改一个数字，重渲一次。"
    meta={`${VIDEO.WIDTH}×${VIDEO.HEIGHT} · ${VIDEO.FPS}fps · ${TIMELINE_END} 帧 · Remotion 4`}
  />
);

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

// Studio exposes each beat as a separate editable page clip. Timing remains
// source-local; OpenFilm controls where the clip sits in the final film.
const STUDIO_BEATS = {title: TitleBeat, statement: StatementBeat, metrics: MetricsBeat, process: ProcessBeat, end: EndBeat};
export const StudioBeat = ({id}: {id: SegId}) => {
  const Content = STUDIO_BEATS[id];
  return <Frame wash><Safe><div id={`beat-${id}`} style={{display: 'flex', flexDirection: 'column', flex: 1}}><Content /></div></Safe></Frame>;
};

export const Main = () => {
  const frame = useCurrentFrame();
  return (
    <Frame wash>
      <BeatLayer id="title">
        <TitleBeat />
      </BeatLayer>
      <BeatLayer id="statement">
        <StatementBeat />
      </BeatLayer>
      <BeatLayer id="metrics">
        <MetricsBeat />
      </BeatLayer>
      <BeatLayer id="process">
        <ProcessBeat />
      </BeatLayer>
      <BeatLayer id="end">
        <EndBeat />
      </BeatLayer>

      {/*
        The callout is mounted at the frame level, not inside a beat, so it can
        float over the content without inheriting a beat's cross-fade.
      */}
      <LowerThird
        kicker="COMMAND"
        title="npm run check"
        meta="typecheck · 时间轴 · 素材 · 对比度"
        start={SEG.process.from + 44}
        end={SEG.process.to - 6}
      />

      {/*
        The footer stays mounted for the whole film: it is the one element that
        makes separately-authored beats feel like a single piece.
      */}
      <Safe style={{pointerEvents: 'none'}}>
        <div style={{flex: 1}} />
        <Footer
          left="程序化视频模板 · 示例片"
          right={
            <Mono style={{fontSize: 13, color: C.textTertiary}}>
              {timecode(frame, VIDEO.FPS)} / {timecode(TIMELINE_END, VIDEO.FPS)}
            </Mono>
          }
        />
      </Safe>
    </Frame>
  );
};
