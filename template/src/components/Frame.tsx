// The frame: background, safe area, and the persistent edge furniture.
//
// Every composition in the project is built as
//
//   <Frame>
//     <Safe> …beats… </Safe>
//   </Frame>
//
// `Frame` owns the full-bleed ground; `Safe` owns the margins. Keeping them
// separate is what lets a beat bleed a panel to the edge on purpose (skip
// `Safe`) without every other beat losing its margins.

import {AbsoluteFill} from 'remotion';
import {type CSSProperties, type ReactNode} from 'react';
import {C, FONT_SANS, SAFE} from '../theme';

type FrameProps = {
  children: ReactNode;
  /** Ground colour: the page by default, `canvas` for a letterboxed look. */
  tone?: 'surface' | 'canvas' | 'alt';
  /** A very faint accent wash at the top. Keep it under 8% opacity. */
  wash?: boolean;
  style?: CSSProperties;
};

const grounds = {
  surface: C.surface,
  canvas: C.canvas,
  alt: C.surfaceAlt,
} as const;

export const Frame = ({
  children,
  tone = 'surface',
  wash = false,
  style,
}: FrameProps) => (
  <AbsoluteFill
    style={{
      background: grounds[tone],
      // The base font is set once, here: every text component inherits it.
      fontFamily: FONT_SANS,
      color: C.text,
      WebkitFontSmoothing: 'antialiased',
      ...style,
    }}
    from={9}
  >
    {wash ? (
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 60% at 50% -10%, ${C.accentSubtle} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
    ) : null}
    {children}
  </AbsoluteFill>
);

type SafeProps = {
  children: ReactNode;
  /** Override individual insets; useful for a full-bleed beat that keeps only the top. */
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  style?: CSSProperties;
};

/** The content area, inset by the design's safe margins. */
export const Safe = ({
  children,
  top = SAFE.top,
  right = SAFE.right,
  bottom = SAFE.bottom,
  left = SAFE.left,
  style,
}: SafeProps) => (
  <AbsoluteFill
    style={{
      padding: `${top}px ${right}px ${bottom}px ${left}px`,
      display: 'flex',
      flexDirection: 'column',
      ...style,
    }}
  >
    {children}
  </AbsoluteFill>
);

/** A plain centred box for one-statement beats. */
export const Center = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      ...style,
    }}
  >
    {children}
  </div>
);

type FooterProps = {
  /** Left slot: usually the film title or a source note. */
  left?: ReactNode;
  /** Right slot: usually the composition id, fps or a date. */
  right?: ReactNode;
  style?: CSSProperties;
};

/**
 * The bottom edge line. Deliberately slight: a hairline and two micro labels.
 *
 * This is the one element that makes separate beats feel like one film, so keep
 * it mounted for the whole composition rather than per-beat.
 */
export const Footer = ({left, right, style}: FooterProps) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 24,
      paddingTop: 16,
      borderTop: `1px solid ${C.borderSubtle}`,
      fontSize: 13,
      color: C.textTertiary,
      lineHeight: 1.4,
      ...style,
    }}
  >
    <div>{left}</div>
    <div style={{fontVariantNumeric: 'tabular-nums'}}>{right}</div>
  </div>
);
