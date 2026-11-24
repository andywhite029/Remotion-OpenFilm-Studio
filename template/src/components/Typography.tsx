// The type scale, as components.
//
// Every text element in a sequence should come from here rather than from a
// hand-written `fontSize`. The scale is small on purpose: eight sizes cover a
// fifteen-second film, and the constraint is what keeps two beats authored
// weeks apart looking like they were set by the same hand.
//
// Sizes live in `theme.ts` (TYPE / LEADING / TRACK). Colours are roles, never
// hex — pass `C.textSecondary`, not `'#5b6472'`.

import {type CSSProperties, type ReactNode} from 'react';
import {C, FONT_MONO, FONT_SANS, LEADING, TRACK, TYPE} from '../theme';

type TextProps = {
  children: ReactNode;
  style?: CSSProperties;
  /** Override the role colour. Pass a token: `C.textSecondary`. */
  color?: string;
};

/** Shared reset so every role starts from the same baseline. */
const base: CSSProperties = {
  margin: 0,
  fontFamily: FONT_SANS,
  color: C.text,
  fontWeight: 400,
  // Text is never selectable inside a video frame.
  userSelect: 'none',
};

/** The one huge line a shot opens on. Use at most once per film. */
export const Display = ({children, style, color}: TextProps) => (
  <div
    style={{
      ...base,
      fontSize: TYPE.display,
      lineHeight: LEADING.tight,
      letterSpacing: TRACK.display,
      fontWeight: 700,
      color: color ?? C.text,
      ...style,
    }}
  >
    {children}
  </div>
);

export const H1 = ({children, style, color}: TextProps) => (
  <div
    style={{
      ...base,
      fontSize: TYPE.h1,
      lineHeight: LEADING.tight,
      letterSpacing: TRACK.heading,
      fontWeight: 700,
      color: color ?? C.text,
      ...style,
    }}
  >
    {children}
  </div>
);

export const H2 = ({children, style, color}: TextProps) => (
  <div
    style={{
      ...base,
      fontSize: TYPE.h2,
      lineHeight: LEADING.snug,
      letterSpacing: TRACK.heading,
      fontWeight: 600,
      color: color ?? C.text,
      ...style,
    }}
  >
    {children}
  </div>
);

export const H3 = ({children, style, color}: TextProps) => (
  <div
    style={{
      ...base,
      fontSize: TYPE.h3,
      lineHeight: LEADING.snug,
      fontWeight: 600,
      color: color ?? C.text,
      ...style,
    }}
  >
    {children}
  </div>
);

/** The sentence under a heading; tuned to be readable at 2 m from the screen. */
export const Lead = ({children, style, color}: TextProps) => (
  <div
    style={{
      ...base,
      fontSize: TYPE.lead,
      lineHeight: LEADING.normal,
      fontWeight: 400,
      color: color ?? C.textSecondary,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Body = ({children, style, color}: TextProps) => (
  <div
    style={{
      ...base,
      fontSize: TYPE.body,
      lineHeight: LEADING.normal,
      color: color ?? C.text,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Small = ({children, style, color}: TextProps) => (
  <div
    style={{
      ...base,
      fontSize: TYPE.small,
      lineHeight: LEADING.normal,
      color: color ?? C.textSecondary,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Footnotes, units, counters. Still must clear 4.5:1 — see CONTRAST_PAIRS. */
export const Micro = ({children, style, color}: TextProps) => (
  <div
    style={{
      ...base,
      fontSize: TYPE.micro,
      lineHeight: LEADING.normal,
      color: color ?? C.textTertiary,
      ...style,
    }}
  >
    {children}
  </div>
);

type MonoProps = TextProps & {
  /** Use for anything that must not change width as digits change. */
  tabular?: boolean;
};

/** Numbers, timecodes, keys. Tabular by default so readings do not jitter. */
export const Mono = ({children, style, color, tabular = true}: MonoProps) => (
  <span
    style={{
      ...base,
      fontFamily: FONT_MONO,
      fontSize: TYPE.small,
      lineHeight: LEADING.normal,
      color: color ?? C.text,
      fontVariantNumeric: tabular ? 'tabular-nums' : 'normal',
      ...style,
    }}
  >
    {children}
  </span>
);

/** The small all-caps label above a heading. One per block, at most. */
export const Kicker = ({children, style, color}: TextProps) => (
  <div
    style={{
      ...base,
      fontSize: TYPE.micro,
      lineHeight: LEADING.normal,
      letterSpacing: TRACK.caps,
      textTransform: 'uppercase',
      fontWeight: 600,
      color: color ?? C.accent,
      ...style,
    }}
  >
    {children}
  </div>
);
