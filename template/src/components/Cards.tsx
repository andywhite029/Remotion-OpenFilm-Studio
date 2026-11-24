// The recurring compositions-within-the-composition.
//
// A fifteen-second product film is almost always built from the same four
// blocks: an opening title, a section header, a lower-third callout, and an end
// card. They are here so a new film's first hour is spent on content, not on
// re-deriving the same three layout decisions.
//
// Every one takes an absolute `start` frame rather than reading `SEG` itself —
// that keeps them reusable in a composition whose beats are laid out
// differently.

import {type CSSProperties, type ReactNode} from 'react';
import {useCurrentFrame} from 'remotion';
import {C, MOTION, RADIUS, SAFE, SPACE} from '../theme';
import {easeOutCubic, progress} from '../lib/format';
import {stagger} from '../lib/motion';
import {DrawLine, FadeIn, ScaleIn, SlideIn} from './Motion';
import {Display, H1, H2, Kicker, Lead, Small} from './Typography';

type BeatHeaderProps = {
  kicker: string;
  title: ReactNode;
  /** Right-aligned context: a count, a unit, a version. */
  meta?: ReactNode;
  start: number;
};

/** The header a content beat opens with. Sits at the top of a `Safe`. */
export const BeatHeader = ({kicker, title, meta, start}: BeatHeaderProps) => (
  <div style={{flexShrink: 0}}>
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: SPACE.lg,
      }}
    >
      <div>
        <FadeIn start={start} duration={MOTION.fast}>
          <Kicker>{kicker}</Kicker>
        </FadeIn>
        <SlideIn start={start + stagger(1, 6)} distance={18}>
          <H2 style={{marginTop: SPACE.sm}}>{title}</H2>
        </SlideIn>
      </div>
      {meta ? (
        <FadeIn start={start + stagger(3, 6)} duration={MOTION.fast}>
          <div
            style={{
              fontSize: 13,
              color: C.textTertiary,
              fontVariantNumeric: 'tabular-nums',
              paddingBottom: 6,
            }}
          >
            {meta}
          </div>
        </FadeIn>
      ) : null}
    </div>
    <div style={{marginTop: SPACE.lg}}>
      <DrawLine
        start={start + stagger(2, 6)}
        duration={MOTION.slow}
        color={C.border}
      />
    </div>
  </div>
);

type TitleCardProps = {
  kicker?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  start: number;
  style?: CSSProperties;
};

/** The opening card: kicker, one huge line, a rule, one supporting sentence. */
export const TitleCard = ({
  kicker,
  title,
  subtitle,
  start,
  style,
}: TitleCardProps) => (
  <div
    style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      maxWidth: 1360,
      ...style,
    }}
  >
    {kicker ? (
      <FadeIn start={start + 2} duration={MOTION.fast}>
        <Kicker>{kicker}</Kicker>
      </FadeIn>
    ) : null}
    <SlideIn start={start + 8} distance={26} duration={MOTION.slow}>
      <Display style={{marginTop: SPACE.lg, maxWidth: 1200}}>{title}</Display>
    </SlideIn>
    <div style={{width: 180, marginTop: SPACE.lg}}>
      <DrawLine
        start={start + 20}
        duration={MOTION.base}
        thickness={3}
        color={C.accentBorder}
      />
    </div>
    {subtitle ? (
      <FadeIn start={start + 26} duration={MOTION.base}>
        <Lead style={{marginTop: SPACE.lg, maxWidth: 940}}>{subtitle}</Lead>
      </FadeIn>
    ) : null}
  </div>
);

type EndCardProps = {
  title: ReactNode;
  meta?: ReactNode;
  start: number;
};

/** The sign-off. Centred, quieter than the opening — it is an exit, not a beat. */
export const EndCard = ({title, meta, start}: EndCardProps) => (
  <div
    style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      gap: SPACE.md,
    }}
  >
    <FadeIn start={start + 4} duration={MOTION.base}>
      <H1>{title}</H1>
    </FadeIn>
    <ScaleIn start={start + 12} from={0.7} duration={MOTION.base}>
      <div
        style={{
          width: 64,
          height: 3,
          borderRadius: 3,
          background: C.accent,
          margin: `${SPACE.xs}px 0`,
        }}
      />
    </ScaleIn>
    {meta ? (
      <FadeIn start={start + 18} duration={MOTION.base}>
        <Small style={{maxWidth: 760}}>{meta}</Small>
      </FadeIn>
    ) : null}
  </div>
);

type LowerThirdProps = {
  kicker: string;
  title: ReactNode;
  meta?: ReactNode;
  /** Frame the callout arrives on. */
  start: number;
  /** Frame it must be gone by. */
  end: number;
};

/**
 * A floating callout over the lower-left of the frame.
 *
 * Mounted at the *frame* level (a sibling of the beats), not inside a `Safe`,
 * because it positions itself against the safe margins and must not move when a
 * beat changes its padding.
 */
export const LowerThird = ({
  kicker,
  title,
  meta,
  start,
  end,
}: LowerThirdProps) => {
  const frame = useCurrentFrame();
  const inT = easeOutCubic(
    progress(frame, start, start + MOTION.base),
  );
  const outT = 1 - progress(frame, end - MOTION.fast, end);
  const opacity = Math.min(inT, outT);
  if (opacity <= 0.001) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: SAFE.left,
        bottom: SAFE.bottom + 48,
        opacity,
        transform: `translate3d(${(1 - inT) * -16}px, 0, 0)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '18px 26px',
          borderRadius: RADIUS.panel,
          background: C.glass,
          border: `1px solid ${C.border}`,
          boxShadow: C.shadow2,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          // The one place a hard 5px accent stripe is worth it: it ties the
          // floating card to the brand without tinting its ground.
          borderLeft: `3px solid ${C.accent}`,
        }}
      >
        <Kicker>{kicker}</Kicker>
        <div style={{fontSize: 22, fontWeight: 600, color: C.text}}>{title}</div>
        {meta ? (
          <div style={{fontSize: 13, color: C.textTertiary}}>{meta}</div>
        ) : null}
      </div>
    </div>
  );
};
