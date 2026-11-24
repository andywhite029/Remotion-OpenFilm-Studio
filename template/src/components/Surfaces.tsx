// Surfaces: the non-text building blocks.
//
// Depth comes from the three shadow tokens plus hairlines, never from glow.
// Anything that needs a border is a `Panel`; anything that needs a separator is
// a `Rule`. Resist adding a one-off wrapper in a sequence — if a new surface is
// genuinely needed, add it here so the next film inherits it.

import {type CSSProperties, type ReactNode} from 'react';
import {C, FONT_SANS, RADIUS, SPACE, withAlpha} from '../theme';

type SurfaceTone = 'surface' | 'alt' | 'sunken' | 'canvas';

const toneBackground: Record<SurfaceTone, string> = {
  surface: C.surface,
  alt: C.surfaceAlt,
  sunken: C.surfaceSunken,
  canvas: C.canvas,
};

const shadows = {
  none: 'none',
  1: C.shadow1,
  2: C.shadow2,
  3: C.shadow3,
} as const;

type PanelProps = {
  children: ReactNode;
  tone?: SurfaceTone;
  /** Elevation level: 0 = flat, 3 = floating media. */
  shadow?: keyof typeof shadows;
  padding?: number;
  radius?: number;
  /** Draw the 1px hairline that makes a white panel visible on white. */
  border?: boolean;
  style?: CSSProperties;
};

/** The one card primitive: white ground + hairline + shadow. */
export const Panel = ({
  children,
  tone = 'surface',
  shadow = 1,
  padding = SPACE.xl,
  radius = RADIUS.card,
  border = true,
  style,
}: PanelProps) => (
  <div
    style={{
      background: toneBackground[tone],
      border: border ? `1px solid ${C.border}` : 'none',
      borderRadius: radius,
      padding,
      boxShadow: shadows[shadow],
      ...style,
    }}
  >
    {children}
  </div>
);

type RuleProps = {
  /** 0 = no dimension: horizontal rules are 100% wide, vertical ones 100% tall. */
  orientation?: 'horizontal' | 'vertical';
  color?: string;
  thickness?: number;
  /** Margin along the rule's own axis. */
  inset?: number;
  style?: CSSProperties;
};

/** A hairline separator. Uses `borderSubtle` unless you say otherwise. */
export const Rule = ({
  orientation = 'horizontal',
  color = C.borderSubtle,
  thickness = 1,
  inset,
  style,
}: RuleProps) => {
  const horizontal = orientation === 'horizontal';
  return (
    <div
      style={{
        flexShrink: 0,
        background: color,
        width: horizontal ? '100%' : thickness,
        height: horizontal ? thickness : '100%',
        margin: horizontal ? `${inset ?? 0}px 0` : `0 ${inset ?? 0}px`,
        ...style,
      }}
    />
  );
};

type ChipTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'negative';

type ChipProps = {
  children: ReactNode;
  tone?: ChipTone;
  style?: CSSProperties;
};

/** A small pill. Tinted ground only — never a saturated fill behind text. */
export const Chip = ({children, tone = 'neutral', style}: ChipProps) => {
  const fg =
    tone === 'accent'
      ? C.accent
      : tone === 'positive'
        ? C.positive
        : tone === 'warning'
          ? C.warning
          : tone === 'negative'
            ? C.negative
            : C.textSecondary;
  // Tints are derived from the status tokens rather than written as literals:
  // a `rgba(23,105,63,0.10)` bed would be wrong under `PALETTES.dark` and would
  // put a bare colour inside a component.
  const bg =
    tone === 'accent'
      ? C.accentSubtle
      : tone === 'positive'
        ? withAlpha(C.positive, 0.1)
        : tone === 'warning'
          ? withAlpha(C.warning, 0.1)
          : tone === 'negative'
            ? withAlpha(C.negative, 0.1)
            : C.surfaceAlt;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 14px',
        borderRadius: RADIUS.chip,
        background: bg,
        border: `1px solid ${tone === 'accent' ? C.accentBorder : C.borderSubtle}`,
        color: fg,
        fontSize: 14,
        fontWeight: 600,
        fontFamily: FONT_SANS,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...style,
      }}
    >
      {children}
    </span>
  );
};

type StatProps = {
  /** Small caps label: what this number is. */
  label: string;
  value: string;
  /** Rendered smaller, after the value: a unit. */
  unit?: string;
  /** One line of context under the number. */
  hint?: string;
  /** Tint the value with the accent when it is the headline figure. */
  emphasis?: boolean;
  style?: CSSProperties;
};

/** A headline number with its label. Keeps every readout on one type scale. */
export const Stat = ({
  label,
  value,
  unit,
  hint,
  emphasis = false,
  style,
}: StatProps) => (
  <div style={{display: 'flex', flexDirection: 'column', gap: 10, ...style}}>
    <div
      style={{
        fontSize: 12,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        fontWeight: 600,
        color: C.textTertiary,
      }}
    >
      {label}
    </div>
    <div style={{display: 'flex', alignItems: 'baseline', gap: 8}}>
      <span
        style={{
          fontSize: 54,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: emphasis ? C.accent : C.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      {unit ? (
        <span style={{fontSize: 20, color: C.textSecondary, fontWeight: 500}}>
          {unit}
        </span>
      ) : null}
    </div>
    {hint ? (
      <div style={{fontSize: 14, color: C.textTertiary, lineHeight: 1.4}}>
        {hint}
      </div>
    ) : null}
  </div>
);

type ProgressBarProps = {
  /** 0..1, already eased by the caller if it is being animated. */
  value: number;
  color?: string;
  height?: number;
  style?: CSSProperties;
};

/** A bar. Draw it by animating `value`, not by animating a width elsewhere. */
export const ProgressBar = ({
  value,
  color = C.accent,
  height = 6,
  style,
}: ProgressBarProps) => (
  <div
    style={{
      width: '100%',
      height,
      borderRadius: height,
      background: C.surfaceSunken,
      overflow: 'hidden',
      ...style,
    }}
  >
    <div
      style={{
        width: `${Math.max(0, Math.min(1, value)) * 100}%`,
        height: '100%',
        borderRadius: height,
        background: color,
      }}
    />
  </div>
);

/** A status dot. Sits before a label, never carries meaning on its own. */
export const Dot = ({
  tone = 'positive',
  size = 8,
  style,
}: {
  tone?: 'positive' | 'warning' | 'negative' | 'neutral';
  size?: number;
  style?: CSSProperties;
}) => {
  const color =
    tone === 'positive'
      ? C.positive
      : tone === 'warning'
        ? C.warning
        : tone === 'negative'
          ? C.negative
          : C.textTertiary;
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: size,
        background: color,
        flexShrink: 0,
        ...style,
      }}
    />
  );
};
