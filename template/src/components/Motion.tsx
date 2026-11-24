// Frame-pure motion wrappers.
//
// These exist so that no sequence ever writes an opacity by hand. Each one is a
// pure function of the current frame — there is no state, no effect, no timer,
// so Remotion can render frame 300 before frame 1 and get the same picture.
//
// Usage: beats call these with an *absolute* start frame, usually derived from
// the shot list, e.g.
//
//   <FadeIn start={SEG.metrics.from + stagger(2)}>
//     <Panel>…</Panel>
//   </FadeIn>

import {useCurrentFrame} from 'remotion';
import {type CSSProperties, type ReactNode} from 'react';
import {MOTION} from '../theme';
import {easeOutCubic, lerp, progress} from '../lib/format';

type Ease = (t: number) => number;

/** The progress of a reveal, as a number you can use anywhere. */
export function useReveal(
  start: number,
  duration: number = MOTION.base,
  ease: Ease = easeOutCubic,
): number {
  const frame = useCurrentFrame();
  return ease(progress(frame, start, start + duration));
}

type RevealProps = {
  /** Absolute composition frame at which the reveal begins. */
  start: number;
  /** Duration in frames. Defaults to `MOTION.base`. */
  duration?: number;
  ease?: Ease;
  style?: CSSProperties;
  children: ReactNode;
};

/** Fade in on [start, start + duration]. */
export const FadeIn = ({
  start,
  duration = MOTION.base,
  ease = easeOutCubic,
  style,
  children,
}: RevealProps) => {
  const t = useReveal(start, duration, ease);
  return <div style={{...style, opacity: t}}>{children}</div>;
};

type SlideInProps = RevealProps & {
  /** Where the content travels *from*. */
  from?: 'up' | 'down' | 'left' | 'right';
  /** Travel distance in px. */
  distance?: number;
};

/** Fade + translate. The default entrance for panels, cards and blocks. */
export const SlideIn = ({
  start,
  duration = MOTION.base,
  ease = easeOutCubic,
  from = 'up',
  distance = 28,
  style,
  children,
}: SlideInProps) => {
  const t = useReveal(start, duration, ease);
  const offset = (1 - t) * distance;
  const dx = from === 'left' ? -offset : from === 'right' ? offset : 0;
  const dy = from === 'up' ? offset : from === 'down' ? -offset : 0;
  return (
    <div
      style={{
        ...style,
        opacity: t,
        transform: `translate3d(${dx}px, ${dy}px, 0)`,
      }}
    >
      {children}
    </div>
  );
};

type ScaleInProps = RevealProps & {
  /** Starting scale. Slightly below 1 reads as "landing". */
  from?: number;
};

/** Fade + scale. Use for a badge, a ring, or a single number that lands. */
export const ScaleIn = ({
  start,
  duration = MOTION.base,
  ease = easeOutCubic,
  from = 0.94,
  style,
  children,
}: ScaleInProps) => {
  const t = useReveal(start, duration, ease);
  return (
    <div
      style={{
        ...style,
        opacity: t,
        transform: `scale(${lerp(from, 1, t)})`,
      }}
    >
      {children}
    </div>
  );
};

type TypewriterProps = {
  start: number;
  /** Characters revealed per frame. 1.2–2.5 reads as typing, not as a wipe. */
  cps?: number;
  text: string;
  /** Leave the caret blinking after the last character. */
  cursor?: boolean;
  style?: CSSProperties;
};

/**
 * Character-by-character reveal for a status line or a URL being typed.
 *
 * The character count is derived from the frame, never from a timer — a
 * `setInterval` here would make the renders nondeterministic.
 */
export const Typewriter = ({
  start,
  cps = 1.8,
  text,
  cursor = true,
  style,
}: TypewriterProps) => {
  const frame = useCurrentFrame();
  const chars = Math.max(0, Math.min(text.length, (frame - start) * cps));
  const shown = text.slice(0, Math.floor(chars));
  const done = chars >= text.length;
  // 2 Hz blink, phase-locked to the frame counter.
  const caretOn = !done || Math.floor(frame / (MOTION.slow / 2)) % 2 === 0;
  return (
    <span style={style}>
      {shown}
      {cursor && caretOn ? (
        <span aria-hidden style={{opacity: 0.6}}>
          |
        </span>
      ) : null}
    </span>
  );
};

type LineProps = {
  start: number;
  duration?: number;
  ease?: Ease;
  orientation?: 'horizontal' | 'vertical';
  color?: string;
  thickness?: number;
  style?: CSSProperties;
};

/** A rule that draws itself. Cheaper and calmer than a sliding block. */
export const DrawLine = ({
  start,
  duration = MOTION.base,
  ease = easeOutCubic,
  orientation = 'horizontal',
  color = 'currentColor',
  thickness = 1,
  style,
}: LineProps) => {
  const t = useReveal(start, duration, ease);
  const horizontal = orientation === 'horizontal';
  return (
    <div
      style={{
        ...style,
        width: horizontal ? '100%' : thickness,
        height: horizontal ? thickness : '100%',
        background: color,
        transform: horizontal ? `scaleX(${t})` : `scaleY(${t})`,
        transformOrigin: horizontal ? 'left center' : 'center top',
      }}
    />
  );
};
