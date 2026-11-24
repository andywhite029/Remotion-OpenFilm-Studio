// SVG chart primitives.
//
// SVG, not <canvas>: Remotion renders frames out of order and in parallel
// processes, and a canvas is a mutable drawing surface keyed to wall-clock
// state. SVG is a declarative function of props, which is exactly the shape
// this pipeline needs.
//
// These are deliberately small — a line, an area, a bar row. Anything fancier
// belongs in a project, not in the template.

import {type CSSProperties} from 'react';
import {C, FONT_MONO} from '../theme';

type LineChartProps = {
  /** Y values, evenly spaced along X. At least two. */
  values: readonly number[];
  width?: number;
  height?: number;
  /** 0..1 draw progress. Animate this, not the data. */
  reveal?: number;
  color?: string;
  /** Tint the area under the line. */
  fill?: boolean;
  strokeWidth?: number;
  /** Draw faint horizontal gridlines at the min/max. */
  grid?: boolean;
  style?: CSSProperties;
};

/**
 * `pathLength="1"` normalises the path so a stroke-dasharray of 1 can be driven
 * by a plain 0..1 progress — no measuring, no getTotalLength().
 */
export const LineChart = ({
  values,
  width = 560,
  height = 200,
  reveal = 1,
  color = C.accent,
  fill = true,
  strokeWidth = 2.5,
  grid = true,
  style,
}: LineChartProps) => {
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;

  const toPoint = (v: number, i: number): [number, number] => {
    const x = n === 1 ? width / 2 : (i / (n - 1)) * width;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y];
  };

  const points = values.map(toPoint);
  const line = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{display: 'block', overflow: 'visible', ...style}}
    >
      {grid ? (
        <g stroke={C.borderSubtle} strokeWidth={1}>
          <line x1={0} y1={pad} x2={width} y2={pad} />
          <line x1={0} y1={height - pad} x2={width} y2={height - pad} />
        </g>
      ) : null}
      {fill ? (
        <path d={area} fill={color} opacity={0.10 * Math.min(1, reveal * 1.5)} />
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - Math.max(0, Math.min(1, reveal))}
      />
    </svg>
  );
};

type BarRowProps = {
  label: string;
  value: number;
  /** Value that corresponds to a full bar. */
  max: number;
  reveal?: number;
  color?: string;
  /** Right-hand readout; defaults to the raw value. */
  valueLabel?: string;
  style?: CSSProperties;
};

/** A labelled horizontal bar. Uses divs: no SVG needed for a rounded rect. */
export const BarRow = ({
  label,
  value,
  max,
  reveal = 1,
  color = C.accent,
  valueLabel,
  style,
}: BarRowProps) => {
  const pct = Math.max(0, Math.min(1, value / (max || 1))) * 100;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        width: '100%',
        ...style,
      }}
    >
      <div
        style={{
          width: 120,
          flexShrink: 0,
          fontSize: 13,
          fontFamily: FONT_MONO,
          color: C.textSecondary,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          height: 8,
          borderRadius: 8,
          background: C.surfaceSunken,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct * Math.max(0, Math.min(1, reveal))}%`,
            height: '100%',
            borderRadius: 8,
            background: color,
          }}
        />
      </div>
      <div
        style={{
          width: 72,
          flexShrink: 0,
          textAlign: 'right',
          fontSize: 13,
          fontFamily: FONT_MONO,
          color: C.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valueLabel ?? value}
      </div>
    </div>
  );
};
