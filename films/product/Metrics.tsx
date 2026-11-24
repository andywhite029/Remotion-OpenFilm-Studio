// The product film's spec chart: the numbers behind the shot.
//
// This is a self-contained composition (like `ThreeDemo`), not a beat of
// `Main`: it owns its own window table, and every reveal is expressed as a
// progress through that table rather than as a bare frame number.

import {useCurrentFrame} from 'remotion';
import {C, SPACE} from '../../template/src/theme';
import {VIDEO} from '../../template/src/timeline';
import {progress} from '../../template/src/lib/format';
import {Frame, Safe} from '../../template/src/components/Frame';
import {BeatHeader} from '../../template/src/components/Cards';
import {FadeIn, SlideIn} from '../../template/src/components/Motion';
import {Panel, Rule, Stat} from '../../template/src/components/Surfaces';
import {BarRow, LineChart} from '../../template/src/components/Chart';
import {Micro, Small} from '../../template/src/components/Typography';
import {SHOT_SECONDS} from './shots';

export const METRICS_DURATION = Math.round(SHOT_SECONDS.metrics * VIDEO.FPS);

/** Reveal windows, in the composition's own frames. The chart is largely drawn
 * by 1.5 s: the shot follows a cut and must not open on an empty page. */
const WIN = {
  bars: 8,
  chart: 18,
  stats: 42,
  footer: 62,
} as const;

const SPECS = [
  {label: '输出功率', value: 60, max: 80, unit: 'W'},
  {label: '续航', value: 18, max: 24, unit: 'h'},
  {label: '重量', value: 2.4, max: 4, unit: 'kg'},
  {label: '最大声压', value: 96, max: 120, unit: 'dB'},
] as const;

/** Frequency response, 80 Hz → 20 kHz, normalised to the sweep's peak. */
const RESPONSE = [
  0.32, 0.48, 0.64, 0.79, 0.93, 0.97, 0.9, 0.82, 0.76, 0.78, 0.84, 0.88, 0.81,
  0.7, 0.58,
] as const;

export const Metrics = () => {
  const frame = useCurrentFrame();

  return (
    <Frame wash>
      <Safe>
        <BeatHeader
          // Negative start: this shot cuts in, so the header is already composed
          // on its first frame — a cut must land on a designed picture, not on
          // a white page waiting for a fade.
          start={-36}
          kicker="SPECS / 参数"
          title="数字，写在时间轴上"
          meta={`${VIDEO.WIDTH}×${VIDEO.HEIGHT} · ${VIDEO.FPS}fps · ${SHOT_SECONDS.metrics.toFixed(1)} 秒`}
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
            start={WIN.bars - 8}
            from="up"
            distance={22}
            style={{flex: 1.1, display: 'flex'}}
          >
            <Panel
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: SPACE.md,
              }}
            >
              <Small>关键参数</Small>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 18,
                  flex: 1,
                  justifyContent: 'center',
                }}
              >
                {SPECS.map((spec, i) => (
                  <BarRow
                    key={spec.label}
                    label={spec.label}
                    value={spec.value}
                    max={spec.max}
                    valueLabel={`${spec.value}${spec.unit}`}
                    reveal={progress(frame, WIN.bars + i * 6, WIN.bars + i * 6 + 26)}
                  />
                ))}
              </div>
              <Rule />
              <Micro>标称值，来自产品页；图表随参数表一起重排。</Micro>
            </Panel>
          </SlideIn>

          <SlideIn
            start={WIN.chart - 12}
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
              <Small>频响曲线</Small>
              <LineChart
                values={[...RESPONSE]}
                width={560}
                height={200}
                reveal={progress(frame, WIN.chart, WIN.chart + 56)}
                style={{alignSelf: 'center'}}
              />
              <FadeIn start={WIN.stats} duration={18}>
                <div style={{display: 'flex', gap: SPACE.xl}}>
                  <Stat label="参数" value="4" unit="个" />
                  <Stat label="镜头" value="3" unit="段" emphasis />
                  <Stat label="交付" value="15.0" unit="秒" />
                </div>
              </FadeIn>
              <Micro style={{color: C.textTertiary}}>
                80 Hz → 20 kHz · 归一化到扫描峰值
              </Micro>
            </Panel>
          </SlideIn>
        </div>

        <FadeIn start={WIN.footer} duration={18}>
          <Micro style={{marginTop: SPACE.md, color: C.textTertiary}}>
            同一套参数：AI 生成镜头，剪辑师在 Studio 改文案和裁切，导出仍走 OpenFilm。
          </Micro>
        </FadeIn>
      </Safe>
    </Frame>
  );
};
