/**
 * FR verbalization engine — v2.3
 *
 * Converts raw frequency response + Harman target into human-readable sentences.
 * Reference: dev/frequency_response_verbalization_plan.md
 */

import { getLocale } from '../i18n';
import { getTargetCurve } from '../target-curves';

export type FrType = 'over-ear' | 'on-ear' | 'in-ear';
export type RenderMode = 'general' | 'technical';
export type OutputLength = 'short' | 'full';
type Severity = 'neutral' | 'slight' | 'clear' | 'severe';
type TextureSeverity = 'smooth' | 'slight_rough' | 'clear_rough' | 'severe_rough';
type ContourPattern =
  | 'neutral'
  | 'v_shape'
  | 'v_shape_bass_led'
  | 'v_shape_treble_led'
  | 'u_shape_subbass_focus'
  | 'inverse_v'
  | 'mid_recessed';

/* ── Internal grid: 20–20 kHz at 1/24 octave ── */

const GRID_START = 20;
const GRID_END = 20000;
const DIVS_PER_OCT = 24;
const GRID_SIZE = Math.ceil(Math.log2(GRID_END / GRID_START) * DIVS_PER_OCT) + 1;

function buildGrid(): Float64Array {
  const g = new Float64Array(GRID_SIZE);
  for (let i = 0; i < GRID_SIZE; i++) g[i] = GRID_START * 2 ** (i / DIVS_PER_OCT);
  return g;
}

const GRID = buildGrid();

/* ── Interpolation ── */

function interpAt(pts: [number, number][], freq: number): number {
  if (freq <= pts[0][0]) return pts[0][1];
  if (freq >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= freq) lo = mid; else hi = mid;
  }
  const [f0, v0] = pts[lo], [f1, v1] = pts[hi];
  return v0 + (Math.log(freq / f0) / Math.log(f1 / f0)) * (v1 - v0);
}

function resample(pts: [number, number][]): Float64Array {
  const out = new Float64Array(GRID_SIZE);
  for (let i = 0; i < GRID_SIZE; i++) out[i] = interpAt(pts, GRID[i]);
  return out;
}

/* ── Grid interpolation ── */

function interpGrid(data: Float64Array, freq: number): number {
  if (freq <= GRID[0]) return data[0];
  if (freq >= GRID[GRID_SIZE - 1]) return data[GRID_SIZE - 1];
  let lo = 0, hi = GRID_SIZE - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (GRID[mid] <= freq) lo = mid; else hi = mid;
  }
  const t = (freq - GRID[lo]) / (GRID[hi] - GRID[lo]);
  return data[lo] + t * (data[hi] - data[lo]);
}

/* ── Log-RMS level offset ── */

/**
 * Constant offset c that minimises equal-weight RMS of (raw - target) over
 * the log-frequency axis 80 Hz–8 kHz.  Because GRID is log-uniform, equal
 * weight on log-f = equal weight on grid indices, so c is simply the mean
 * of the per-grid-point differences in that range.
 */
function computeLogRmsOffset(rawData: Float64Array, targetData: Float64Array): number {
  let sum = 0, count = 0;
  for (let i = 0; i < GRID_SIZE; i++) {
    const f = GRID[i];
    if (f >= 80 && f <= 8000) { sum += rawData[i] - targetData[i]; count++; }
  }
  return count ? sum / count : 0;
}

/* ── Smoothing (box on uniform log-freq grid) ── */

function smoothOct(data: Float64Array, halfOct: number): Float64Array {
  const hw = Math.max(1, Math.round(halfOct * DIVS_PER_OCT));
  const out = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const lo = Math.max(0, i - hw), hi = Math.min(data.length - 1, i + hw);
    let s = 0;
    for (let j = lo; j <= hi; j++) s += data[j];
    out[i] = s / (hi - lo + 1);
  }
  return out;
}

function makeMacro(error: Float64Array): Float64Array {
  const s6 = smoothOct(error, 1 / 12);  // 1/6 oct half
  const s5 = smoothOct(error, 1 / 10);  // 1/5 oct half
  const s3 = smoothOct(error, 1 / 6);   // 1/3 oct half
  const out = new Float64Array(error.length);
  for (let i = 0; i < GRID_SIZE; i++) {
    const f = GRID[i];
    out[i] = f <= 200 ? s6[i] : f <= 8000 ? s5[i] : s3[i];
  }
  return out;
}

/* ── Range helpers ── */

function rangeIdx(fLo: number, fHi: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    if (GRID[i] >= fLo && GRID[i] <= fHi) idx.push(i);
  }
  return idx;
}

function rangeVals(data: Float64Array, fLo: number, fHi: number): number[] {
  return rangeIdx(fLo, fHi).map(i => data[i]);
}

function mean(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function rangeMean(data: Float64Array, fLo: number, fHi: number): number {
  return mean(rangeVals(data, fLo, fHi));
}

function trimMean(vals: number[], tr = 0.1): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const k = Math.floor(s.length * tr);
  const t = s.slice(k, s.length - k);
  return t.length ? mean(t) : mean(s);
}

function sd(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  return Math.sqrt(vals.reduce((sum, v) => sum + (v - m) ** 2, 0) / vals.length);
}

function linSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = mean(xs), my = mean(ys);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return den > 0 ? num / den : 0;
}

function trimRms(vals: number[], tr = 0.1): number {
  if (!vals.length) return 0;
  const s = [...vals.map(Math.abs)].sort((a, b) => a - b);
  const k = Math.floor(s.length * tr);
  const t = s.slice(k, s.length - k);
  const arr = t.length ? t : s;
  return Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0) / arr.length);
}

/* ── Severity helpers ── */

type SevT = [number, number, number]; // [slight, clear, severe]

const BAND_THRESH: Record<string, SevT> = {
  '20_60':   [2.5, 4.5, 7.0],
  '60_120':  [2.0, 4.0, 6.0],
  '120_250': [1.75, 3.25, 5.0],
  '250_500': [1.5, 3.0, 4.5],
  '500_1k':  [1.25, 2.5, 4.0],
  '1k_2k':   [1.25, 2.5, 4.0],
  '2k_4k':   [1.0, 2.0, 3.25],
  '4k_8k':   [1.5, 2.75, 4.25],
  '8k_20k':  [2.5, 4.5, 6.5],
};

function bandSev(key: string, absV: number): Severity {
  const [s, c, sv] = BAND_THRESH[key] ?? [1.5, 3.0, 5.0];
  if (absV < s) return 'neutral';
  if (absV < c) return 'slight';
  if (absV < sv) return 'clear';
  return 'severe';
}

function pdSev(kind: 'peak' | 'dip' | 'peak_dip_pair', prominenceDb: number): Severity {
  if (kind === 'peak') {
    if (prominenceDb < 3.0) return 'slight';
    if (prominenceDb < 5.0) return 'clear';
    return 'severe';
  }
  if (kind === 'dip') {
    if (prominenceDb < 4.5) return 'slight';
    if (prominenceDb < 7.0) return 'clear';
    return 'severe';
  }
  // peak_dip_pair: use the more conservative (peak) thresholds
  if (prominenceDb < 3.0) return 'slight';
  if (prominenceDb < 5.0) return 'clear';
  return 'severe';
}

function sevV(v: number): Severity {
  if (v < 3.0) return 'neutral';
  if (v < 4.5) return 'slight';
  if (v < 6.5) return 'clear';
  return 'severe';
}

function sevInvV(v: number): Severity {
  if (v < 2.5) return 'neutral';
  if (v < 4.0) return 'slight';
  if (v < 6.0) return 'clear';
  return 'severe';
}

function sevMidRecess(v: number): Severity {
  if (v < 2.0) return 'neutral';
  if (v < 3.5) return 'slight';
  if (v < 5.0) return 'clear';
  return 'severe';
}

/* ── Localisation ── */

interface BandTexts {
  neutralText: string;
  posText: string;   // template: {adv}
  negText: string;   // template: {adv}
  praiseText: string;
}

interface NarStrings {
  adv(sev: Severity): string;
  adjSev(sev: Severity): string;
  summary: [string, string, string, string];
  slopeHigh: string;  // template: {adv}
  slopeLow: string;   // template: {adv}
  contourText: Record<ContourPattern, string>;  // template: {adv}
  bandText: Record<string, BandTexts>;
  bassShelf: string;
  bassAllBelow: string;
  bassSubbass: string;
  bassMidbass: string;
  bassUpperbass: string;
  integration1k2kPos: string;
  integration1k2kNeg: string;
  texture: [string, string, string, string];  // smooth … severe_rough
  pdPair: Partial<Record<string, string>>;    // template: {adj}
  pd: Record<string, { peak: string; dip: string }>;  // template: {adj}
}

const STRINGS_EN: NarStrings = {
  adv(sev) {
    if (sev === 'slight') return 'somewhat ';
    if (sev === 'severe') return 'notably ';
    return '';
  },
  adjSev(sev) {
    if (sev === 'slight') return 'minor ';
    if (sev === 'severe') return 'prominent ';
    return '';
  },
  summary: [
    'The frequency response tracks the target curve very closely.',
    'The frequency response follows the target curve well.',
    'The frequency response deviates somewhat from the target curve.',
    'The frequency response deviates substantially from the target curve.',
  ],
  slopeHigh: 'The overall response tilts {adv}bright.',
  slopeLow:  'The overall response tilts {adv}dark.',
  contourText: {
    neutral: '',
    u_shape_subbass_focus:
      'Sub-bass is {adv}boosted while upper bass stays controlled — extension digs deep without bloom.',
    v_shape_treble_led:
      'A treble-led V-shape — brightness and edge come {adv}forward while the midrange sounds lean and distant.',
    v_shape_bass_led:
      'A bass-led V-shape — low-end weight and punch are {adv}prominent while the midrange steps back.',
    v_shape:
      'Bass and treble are {adv}elevated with the midrange recessed in a V-shape. Bass and sparkle stand out while vocals sound somewhat distant.',
    inverse_v:
      'An inverse-V shape with the midrange {adv}pushed forward — vocals and lead instruments sound close and full.',
    mid_recessed:
      'The midrange is {adv}recessed, pushing vocals and lead instruments further back in the mix.',
  },
  bandText: {
    '20_60': {
      neutralText: 'Sub-bass extends naturally to the lowest octave.',
      posText:     'Sub-bass depth and weight are {adv}elevated.',
      negText:     'Sub-bass depth and weight are {adv}reduced.',
      praiseText:  'Sub-bass extends cleanly to the lowest octave, providing a solid natural foundation for the low end.',
    },
    '60_120': {
      neutralText: 'Kick impact and bass body feel naturally balanced.',
      posText:     'Kick impact and bass body are {adv}elevated.',
      negText:     'Kick impact and bass body are {adv}reduced.',
      praiseText:  'Kick impact and bass body feel naturally balanced, with a satisfying sense of drive.',
    },
    '120_250': {
      neutralText: 'Low-end warmth and fullness are naturally proportioned.',
      posText:     'Low-end warmth and fullness are {adv}elevated.',
      negText:     'Low-end warmth and fullness are {adv}reduced.',
      praiseText:  'Low-end warmth and fullness are well-proportioned, keeping the overall tonal balance grounded.',
    },
    '250_500': {
      neutralText: 'Upper-bass density feels natural.',
      posText:     'Upper-bass density is {adv}elevated.',
      negText:     'Upper-bass density is {adv}reduced.',
      praiseText:  'Upper-bass density is well-balanced, with a natural sense of instrument body and resonance.',
    },
    '500_1k': {
      neutralText: 'Midrange body and core are stable.',
      posText:     'Midrange body and core are {adv}elevated.',
      negText:     'Midrange body and core are {adv}reduced.',
      praiseText:  'Midrange body and core are stable, letting each instrument come through with clear presence.',
    },
    '1k_2k': {
      neutralText: 'Vocal and lead-instrument placement feel natural.',
      posText:     'Vocals and lead instruments are {adv}forward.',
      negText:     'Vocals and lead instruments are {adv}recessed.',
      praiseText:  'Vocal and lead-instrument placement feel natural, with low listening fatigue.',
    },
    '2k_4k': {
      neutralText: 'Presence and clarity are well-balanced.',
      posText:     'Presence and clarity are {adv}elevated.',
      negText:     'Presence and clarity are {adv}reduced.',
      praiseText:  'Presence and clarity are balanced and smooth — comfortable for extended listening.',
    },
    '4k_8k': {
      neutralText: 'Attack and transient detail are well-defined without being excessive.',
      posText:     'Attack and transient detail are {adv}elevated.',
      negText:     'Attack and transient detail are {adv}reduced.',
      praiseText:  'Attack and transient detail are well-defined without harshness, reproducing fine nuances naturally.',
    },
    '8k_20k': {
      neutralText: 'High-frequency air and extension feel natural.',
      posText:     'Treble air and extension are potentially {adv}elevated.',
      negText:     'Treble air and extension are potentially {adv}reduced.',
      praiseText:  'Treble air feels natural and unfatiguing, with the full range cohesively balanced.',
    },
  },
  bassShelf:    'Bass is uniformly elevated in a shelf shape, with fullness from sub-bass through upper bass.',
  bassAllBelow: 'Bass is uniformly subdued, giving the sound a light, lean low end.',
  bassSubbass:  'Deep sub-bass is notably prominent, extending downward without bloating the upper bass.',
  bassMidbass:  'Mid-bass punch is prominent — kick drums hit with a full, weighty impact.',
  bassUpperbass:'Upper bass is prominent, adding warmth and body to the overall character.',
  integration1k2kPos: 'Vocal presence and clarity are both pushed forward.',
  integration1k2kNeg: 'Vocal presence and clarity are both recessed.',
  texture: [
    'The main frequency bands are relatively smooth with no strong tonal coloration.',
    'The main bands show slight fine-grained unevenness that can add subtle tonal character.',
    'The main bands show noticeable unevenness — tonal character may vary with recordings and playback level.',
    'The main bands are heavily uneven, with wide variation in tonal quality across the spectrum.',
  ],
  pdPair: {
    '1k_2k':  'A {adj}peak-dip pair around 1–3 kHz can create uneven coloration in vocals and lead instruments.',
    '2k_4k':  'A {adj}peak-dip pair around 3–5 kHz gives the presence region an irregular edge.',
    '4k_8k':  'A {adj}peak-dip pair around 5–8 kHz mixes sharp and smooth transient character.',
    '8k_12k': 'A {adj}peak-dip pair around 8–12 kHz may cause uneven upper-treble sparkle.',
  },
  pd: {
    '250_500': {
      peak: 'A {adj}local peak at 250–500 Hz may add localized boxiness or muddiness.',
      dip:  'A {adj}local dip at 250–500 Hz can thin out body in a narrow range.',
    },
    '500_1k': {
      peak: 'A {adj}local peak at 500 Hz–1 kHz can add localized midrange bloom.',
      dip:  'A {adj}local dip at 500 Hz–1 kHz can leave the midrange sounding slightly hollow.',
    },
    '1k_2k': {
      peak: 'A {adj}local peak at 1–2 kHz can push vocals and guitars forward in a narrow band.',
      dip:  'A {adj}local dip at 1–2 kHz can strip core from vocals, making them sound distant.',
    },
    '2k_4k': {
      peak: 'A {adj}local peak at 2–4 kHz can create narrow-band presence emphasis.',
      dip:  'A {adj}local dip at 2–4 kHz can reduce clarity in a specific range.',
    },
    '4k_8k': {
      peak: 'A {adj}local peak at 4–8 kHz can cause sibilance or cymbal harshness.',
      dip:  'A {adj}local dip at 4–8 kHz rounds off transient edges, giving a smoother character.',
    },
    '8k_12k': {
      peak: 'A {adj}local peak at 8–12 kHz may add localized upper-treble glare.',
      dip:  'A {adj}local dip at 8–12 kHz may limit air and extension in the upper range.',
    },
  },
};

const STRINGS_JA: NarStrings = {
  adv(sev) {
    if (sev === 'slight') return 'わずかに';
    if (sev === 'severe') return '著しく';
    return '';
  },
  adjSev(sev) {
    if (sev === 'slight') return 'わずかな';
    if (sev === 'severe') return '著しい';
    return '';
  },
  summary: [
    '周波数特性のTargetカーブへの追従性は非常に高いです',
    '周波数特性のTargetカーブへの追従性は良好です',
    'Targetカーブからの周波数特性のずれがやや見られます',
    'Targetカーブからの周波数特性のずれが大きめです',
  ],
  slopeHigh: '全体として{adv}高域寄りの周波数特性です。',
  slopeLow:  '全体として{adv}低域寄りの周波数特性です。',
  contourText: {
    neutral: '',
    u_shape_subbass_focus:
      '深い低域だけを{adv}強めたU字寄りです。中低域を膨らませず、下だけ沈み込むタイプの低音に聞こえます',
    v_shape_treble_led:
      '高域側が主導する{adv}V字傾向です。明るさと輪郭が先に立ち、主旋律はやや細く遠く聞こえます',
    v_shape_bass_led:
      '低域側が主導する{adv}V字傾向です。低音の厚みと押し出しが先に来て、主旋律は少し奥に下がって聞こえます',
    v_shape:
      '低域と高域が{adv}持ち上がり、中域が引くV字傾向です。低音ときらびやかさは目立ちやすい一方、ボーカルはやや遠く聞こえます',
    inverse_v:
      '中域が{adv}前に張り出した逆V字傾向です。ボーカルや主旋律が近く濃く聞こえやすいです',
    mid_recessed:
      '中域が{adv}引き気味で、主旋律や声がやや後ろに下がって聞こえます',
  },
  bandText: {
    '20_60': {
      neutralText: 'サブベースは最下層まで無理なく伸びています',
      posText:     'サブベースの沈み込みと重量感が{adv}強いです',
      negText:     'サブベースの沈み込みと重量感が{adv}弱いです',
      praiseText:  'サブベースは最下層まで自然に伸び、重低音の土台がしっかり整っています',
    },
    '60_120': {
      neutralText: '低音の芯と押し出しは自然です',
      posText:     'キックの打撃感と低音の芯が{adv}強いです',
      negText:     'キックの打撃感と低音の芯が{adv}弱いです',
      praiseText:  '低域の芯と押し出しが安定しており、キックの打撃感もバランス良く出ています',
    },
    '120_250': {
      neutralText: '低域の厚みと温度感の配分は自然です',
      posText:     '低域の厚みと温かさが{adv}強いです',
      negText:     '低域の厚みと温かさが{adv}弱いです',
      praiseText:  '低域の厚みと温度感のバランスが整っており、全体の重心が安定しています',
    },
    '250_500': {
      neutralText: '低中域の密度は自然です',
      posText:     '低中域の密度が{adv}高いです',
      negText:     '低中域の密度が{adv}低いです',
      praiseText:  '低中域の密度が過不足なく整い、楽器の胴鳴り感が自然に出ています',
    },
    '500_1k': {
      neutralText: '中域の芯立ちは安定しています',
      posText:     '中域の密度と芯が{adv}強いです',
      negText:     '中域の密度と芯が{adv}弱いです',
      praiseText:  '中域の芯立ちが安定しており、楽器ひとつひとつの存在感が過不足なく出ています',
    },
    '1k_2k': {
      neutralText: 'ボーカルや主旋律の距離感は自然です',
      posText:     'ボーカルと主旋律が{adv}前に出ます',
      negText:     'ボーカルと主旋律が{adv}引きます',
      praiseText:  'ボーカルや主旋律の距離感が自然で、聴き疲れしにくいバランスが保たれています',
    },
    '2k_4k': {
      neutralText: '明瞭さと存在感の釣り合いが取れています',
      posText:     'プレゼンスと明瞭さが{adv}強いです',
      negText:     'プレゼンスと明瞭さが{adv}弱いです',
      praiseText:  'プレゼンスと明瞭さのバランスが整っており、刺さりが出にくく長時間のリスニングにも向きます',
    },
    '4k_8k': {
      neutralText: '輪郭は十分に立ちつつ過度ではありません',
      posText:     'アタック感と輪郭が{adv}強いです',
      negText:     'アタック感と輪郭が{adv}弱いです',
      praiseText:  '輪郭感とアタックが過不足なく整い、細部のニュアンスも自然に再現されています',
    },
    '8k_20k': {
      neutralText: '高域の開放感は自然と考えられます',
      posText:     '高域の抜けと空気感が{adv}強い可能性があります',
      negText:     '高域の抜けと空気感が{adv}控えめな可能性があります',
      praiseText:  '高域の開放感が自然で、空気感が過剰にならず全帯域が心地よくまとまっている可能性があります',
    },
  },
  bassShelf:    '低域はシェルフ状に一貫して持ち上がっています。下から中低域までまとめて厚く聞こえやすいです',
  bassAllBelow: '低域は全体に控えめで、土台が軽く聞こえやすいです',
  bassSubbass:  '深い低域の沈み込みが目立ちます。重低音だけが下へ伸びるタイプです',
  bassMidbass:  '中低域のパンチが前に出ます。キックの一撃が太く感じやすいです',
  bassUpperbass:'上側低域の厚みが目立ちます。温かさや膨らみが乗りやすいです',
  integration1k2kPos: 'ボーカルの前後感とプレゼンスがまとめて前に出ます',
  integration1k2kNeg: 'ボーカルの前後感とプレゼンスがまとめて控えめです',
  texture: [
    '主要な帯域は比較的滑らかで、質感の癖は強くありません',
    '主要な帯域にやや細かな凹凸があり、音色に小さな癖が乗りやすいです',
    '主要な帯域に明確な凹凸があり、録音や音量で質感の印象が変わりやすいです',
    '主要な帯域の凹凸が大きく、帯域ごとの当たり外れが出やすいです',
  ],
  pdPair: {
    '1k_2k':  '1–3 kHzに{adj}山谷があり、声や主旋律の出方にむらが出やすいです',
    '2k_4k':  '3–5 kHzに{adj}山谷があり、輪郭の硬さに癖が出やすいです',
    '4k_8k':  '5–8 kHzに{adj}山谷があり、刺さる音と穏やかな音が混在しやすいです',
    '8k_12k': '8–12 kHzに{adj}山谷があり、高域上部の輝き方にむらが出やすい可能性があります',
  },
  pd: {
    '250_500': {
      peak: '250–500 Hzに{adj}局所ピークがあり、胴鳴りやこもりが局所的に増えやすいです',
      dip:  '250–500 Hzに{adj}局所ディップがあり、厚みが一部だけ痩せやすいです',
    },
    '500_1k': {
      peak: '500 Hz–1 kHzに{adj}局所ピークがあり、中域の芯が局所的に膨らみやすいです',
      dip:  '500 Hz–1 kHzに{adj}局所ディップがあり、芯が抜けて少し軽く感じやすいです',
    },
    '1k_2k': {
      peak: '1–2 kHzに{adj}局所ピークがあり、声やギターが張り付くように前へ出やすいです',
      dip:  '1–2 kHzに{adj}局所ディップがあり、声の芯が抜けて少し遠く感じやすいです',
    },
    '2k_4k': {
      peak: '2–4 kHzに{adj}局所ピークがあり、プレゼンスが局所的に強調されやすいです',
      dip:  '2–4 kHzに{adj}局所ディップがあり、明瞭さの一部が落ち込みやすいです',
    },
    '4k_8k': {
      peak: '4–8 kHzに{adj}局所ピークがあり、歯擦音やシンバルの刺さりが出やすいです',
      dip:  '4–8 kHzに{adj}局所ディップがあり、輪郭感が抜けてやや穏やかに聞こえます',
    },
    '8k_12k': {
      peak: '8–12 kHzに{adj}局所ピークがあり、きらつきが局所的に目立ちやすい可能性があります',
      dip:  '8–12 kHzに{adj}局所ディップがあり、抜けの伸びが少し頭打ちになりやすい可能性があります',
    },
  },
};

function getS(): NarStrings {
  return getLocale() === 'ja' ? STRINGS_JA : STRINGS_EN;
}

/* ── Result types ── */

interface SummaryResult {
  summarySD: number;
  absSlope: number;
  signedSlope: number;
  text: string;
  techSuffix: string;
}

interface ContourResult {
  pattern: ContourPattern;
  strengthDb: number;
  severity: Severity;
  text: string;
  techSuffix: string;
}

interface SlopeResult {
  slopeDbPerOct: number;
  severity: Severity;
  sign: -1 | 0 | 1;
  text?: string;
  techSuffix: string;
}

interface BandResult {
  band: string;
  label: string;
  fLo: number;
  fHi: number;
  valueDb: number;
  severity: Severity;
  sign: -1 | 0 | 1;
  domain: 'low' | 'bodyPresence' | 'treble' | 'air';
  text: string;       // always set (neutral bands use neutralText)
  techSuffix: string;
}

export interface BandNarration {
  label: string;
  text: string;
  valueDb: number;
  severity: Severity;
}

interface TextureResult {
  roughnessDb: number;
  severity: TextureSeverity;
  text: string;
  techSuffix: string;
}

export interface PeakDipResult {
  kind: 'peak' | 'dip' | 'peak_dip_pair';
  fcHz: number;
  prominenceDb: number;
  widthOct: number;
  score: number;
  region: '250_500' | '500_1k' | '1k_2k' | '2k_4k' | '4k_8k' | '8k_12k';
  text: string;
  techSuffix: string;
}

interface Candidate {
  domain: 'summary' | 'shape' | 'tilt' | 'low' | 'bodyPresence' | 'treble' | 'texture' | 'resonance' | 'air' | 'praise';
  priority: number;
  score: number;
  text: string;
}

export type { Severity };

export interface FRNarration {
  paragraphs: string[];           // all selected sentences (legacy, includes band sentences)
  summaryParagraphs: string[];    // non-band sentences only: summary, shape, tilt, texture, resonance
  bandNarrations: BandNarration[];  // all 9 bands, always
  summarySD: number;
  absSlope: number;
  allPeaksDips: PeakDipResult[];  // all detected peaks/dips before narration suppression, for visualization
}

/* ── Band definitions (static — text from NarStrings) ── */

const BAND_DEFS: Array<{
  key: string; label: string; fLo: number; fHi: number;
  domain: 'low' | 'bodyPresence' | 'treble' | 'air';
}> = [
  { key: '20_60',   label: '20–60 Hz',      fLo: 20,   fHi: 60,    domain: 'low' },
  { key: '60_120',  label: '60–120 Hz',     fLo: 60,   fHi: 120,   domain: 'low' },
  { key: '120_250', label: '120–250 Hz',    fLo: 120,  fHi: 250,   domain: 'low' },
  { key: '250_500', label: '250–500 Hz',    fLo: 250,  fHi: 500,   domain: 'bodyPresence' },
  { key: '500_1k',  label: '500 Hz–1 kHz',  fLo: 500,  fHi: 1000,  domain: 'bodyPresence' },
  { key: '1k_2k',   label: '1–2 kHz',       fLo: 1000, fHi: 2000,  domain: 'bodyPresence' },
  { key: '2k_4k',   label: '2–4 kHz',       fLo: 2000, fHi: 4000,  domain: 'treble' },
  { key: '4k_8k',   label: '4–8 kHz',       fLo: 4000, fHi: 8000,  domain: 'treble' },
  { key: '8k_20k',  label: '8–20 kHz',      fLo: 8000, fHi: 20000, domain: 'air' },
];

/* ── Analysis sub-functions ── */

function analyzeSummary(macro: Float64Array, s: NarStrings): SummaryResult {
  const vals = rangeVals(macro, 40, 10000);
  const summarySD = sd(vals);
  const idx = rangeIdx(40, 10000);
  const xs = idx.map(i => Math.log2(GRID[i] / 1000));
  const ys = idx.map(i => macro[i]);
  const signedSlope = linSlope(xs, ys);
  const absSlope = Math.abs(signedSlope);

  const text =
    summarySD < 1.4 && absSlope < 0.40 ? s.summary[0] :
    summarySD < 2.0 && absSlope < 0.65 ? s.summary[1] :
    summarySD < 2.8 && absSlope < 0.95 ? s.summary[2] :
    s.summary[3];

  return {
    summarySD, absSlope, signedSlope, text,
    techSuffix: `（summarySD=${summarySD.toFixed(2)} dB, |slope|=${absSlope.toFixed(2)} dB/oct）`,
  };
}

function analyzeContour(macro: Float64Array, frType: FrType, s: NarStrings): ContourResult | undefined {
  const mSB = rangeMean(macro, 20, 60);
  const m60_200 = rangeMean(macro, 60, 200);
  const LB = frType === 'in-ear'
    ? rangeMean(macro, 20, 200)
    : (0.7 * mSB + 1.0 * m60_200) / 1.7;
  const BD = rangeMean(macro, 200, 1000);
  const PR = rangeMean(macro, 1000, 3000);
  const TB = rangeMean(macro, 3000, 8000);

  const midLow = (LB + TB) / 2;
  const midMid = (BD + PR) / 2;
  const vBroad = midLow - midMid;
  const invBroad = midMid - midLow;
  const midRecess = midLow - PR;
  const vTilt = TB - LB;

  const isSubbassU = mSB >= m60_200 + 1.5 && PR <= 0.0;
  const isV = vBroad >= 3.0 && (LB - BD) >= 1.5 && (TB - PR) >= 1.0 && PR <= 0.5;
  const isInvV = invBroad >= 2.5 && BD >= 0.0 && PR >= 1.0 && (PR >= LB + 1.0 || PR >= TB + 1.0);

  const applyAdv = (tmpl: string, sev: Severity) => tmpl.replace('{adv}', s.adv(sev));

  if (isSubbassU) {
    const sev = sevV(vBroad);
    return {
      pattern: 'u_shape_subbass_focus', strengthDb: vBroad, severity: sev,
      text: applyAdv(s.contourText.u_shape_subbass_focus, sev),
      techSuffix: `（LB=${LB.toFixed(1)} BD=${BD.toFixed(1)} PR=${PR.toFixed(1)} TB=${TB.toFixed(1)} dB）`,
    };
  }

  if (isV) {
    const sev = sevV(vBroad);
    let pattern: ContourPattern, text: string;
    if (vTilt >= 1.5) {
      pattern = 'v_shape_treble_led';
      text = applyAdv(s.contourText.v_shape_treble_led, sev);
    } else if (vTilt <= -1.5) {
      pattern = 'v_shape_bass_led';
      text = applyAdv(s.contourText.v_shape_bass_led, sev);
    } else {
      pattern = 'v_shape';
      text = applyAdv(s.contourText.v_shape, sev);
    }
    return {
      pattern, strengthDb: vBroad, severity: sev, text,
      techSuffix: `（vBroad=${vBroad.toFixed(1)}, vTilt=${vTilt.toFixed(1)} dB）`,
    };
  }

  if (isInvV) {
    const sev = sevInvV(invBroad);
    return {
      pattern: 'inverse_v', strengthDb: invBroad, severity: sev,
      text: applyAdv(s.contourText.inverse_v, sev),
      techSuffix: `（invBroad=${invBroad.toFixed(1)} dB）`,
    };
  }

  if (midRecess >= 2.0) {
    const sev = sevMidRecess(midRecess);
    return {
      pattern: 'mid_recessed', strengthDb: midRecess, severity: sev,
      text: applyAdv(s.contourText.mid_recessed, sev),
      techSuffix: `（midRecess=${midRecess.toFixed(1)} dB）`,
    };
  }

  return undefined;
}

function analyzeSlope(macro: Float64Array, s: NarStrings): SlopeResult {
  const idx = rangeIdx(40, 10000);
  const xs = idx.map(i => Math.log2(GRID[i] / 1000));
  const ys = idx.map(i => macro[i]);
  const m = linSlope(xs, ys);
  const absM = Math.abs(m);

  const severity: Severity =
    absM < 0.30 ? 'neutral' :
    absM < 0.70 ? 'slight' :
    absM < 1.20 ? 'clear' : 'severe';

  const sign = (m > 0 ? 1 : m < 0 ? -1 : 0) as -1 | 0 | 1;
  const a = s.adv(severity);
  const text = severity === 'neutral' ? undefined :
    (m > 0
      ? s.slopeHigh.replace('{adv}', a)
      : s.slopeLow.replace('{adv}', a));

  return { slopeDbPerOct: m, severity, sign, text, techSuffix: `（slope=${m.toFixed(2)} dB/oct）` };
}

function fmtHz(hz: number): string {
  return hz < 1000 ? `${hz}` : `${hz / 1000}k`;
}

function analyzeBands(macro: Float64Array, s: NarStrings): BandResult[] {
  return BAND_DEFS.map(d => {
    const bt = s.bandText[d.key];
    const v = trimMean(rangeVals(macro, d.fLo, d.fHi), 0.1);
    const sev = bandSev(d.key, Math.abs(v));
    const sign = (v > 0 ? 1 : v < 0 ? -1 : 0) as -1 | 0 | 1;
    const template = sev === 'neutral' ? bt.neutralText : (v > 0 ? bt.posText : bt.negText);
    const text = template.replace('{adv}', s.adv(sev));
    const techSuffix = `（${fmtHz(d.fLo)}–${fmtHz(d.fHi)} Hz, ${v >= 0 ? '+' : ''}${v.toFixed(1)} dB）`;
    return { band: d.key, label: d.label, fLo: d.fLo, fHi: d.fHi, valueDb: v, severity: sev, sign, domain: d.domain, text, techSuffix };
  });
}

function analyzeTexture(residual: Float64Array, s: NarStrings): TextureResult {
  const roughnessDb = trimRms(rangeVals(residual, 1000, 8000), 0.1);
  const severity: TextureSeverity =
    roughnessDb < 1.25 ? 'smooth' :
    roughnessDb < 2.0 ? 'slight_rough' :
    roughnessDb < 3.0 ? 'clear_rough' : 'severe_rough';

  const idx = ['smooth', 'slight_rough', 'clear_rough', 'severe_rough'].indexOf(severity);
  return { roughnessDb, severity, text: s.texture[idx], techSuffix: `（roughness=${roughnessDb.toFixed(2)} dB）` };
}

const PD_REGIONS: Array<{
  fLo: number; fHi: number;
  key: '250_500' | '500_1k' | '1k_2k' | '2k_4k' | '4k_8k' | '8k_12k';
}> = [
  { fLo: 250,  fHi: 500,   key: '250_500' },
  { fLo: 500,  fHi: 1000,  key: '500_1k'  },
  { fLo: 1000, fHi: 2000,  key: '1k_2k'   },
  { fLo: 2000, fHi: 4000,  key: '2k_4k'   },
  { fLo: 4000, fHi: 8000,  key: '4k_8k'   },
  { fLo: 8000, fHi: 12000, key: '8k_12k'  },
];

function analyzePeaksDips(
  error: Float64Array, texture: TextureResult, s: NarStrings,
): { all: PeakDipResult[]; selected: PeakDipResult[] } {
  // Smooth the error at 1/12-oct half-window (5-point box) to get stable local extrema
  // without losing features visible on a typical FR graph display.
  const sm = smoothOct(error, 1 / 12);

  // Enumerate all local maxima and minima on the smoothed error curve.
  const maxima: number[] = [];
  const minima: number[] = [];
  for (let i = 1; i < GRID_SIZE - 1; i++) {
    if (sm[i] > sm[i - 1] && sm[i] > sm[i + 1]) maxima.push(i);
    if (sm[i] < sm[i - 1] && sm[i] < sm[i + 1]) minima.push(i);
  }

  // Detection threshold.  Scale gently with roughness so that extremely
  // rough-sounding units don't report every wrinkle, but keep a 1.5 dB floor
  // so that smooth units still report clearly audible peaks/dips.
  const threshold = Math.max(1.5, texture.roughnessDb * 0.8);

  const candidates: PeakDipResult[] = [];

  const SEARCH_OCT = 0.25;

  const processExtremum = (pi: number, isPeak: boolean) => {
    const fcHz = GRID[pi];
    const reg = PD_REGIONS.find(r => fcHz >= r.fLo && fcHz <= r.fHi);
    if (!reg) return;

    const pv = sm[pi];
    const fLo = fcHz * 2 ** -SEARCH_OCT;
    const fHi = fcHz * 2 **  SEARCH_OCT;

    // Find the most extreme value within ±0.25 oct on each side.
    // For peaks we look for the lowest point (deepest valley); for dips the highest.
    let leftExtr = pv;
    for (let j = pi - 1; j >= 0 && GRID[j] >= fLo; j--) {
      if (isPeak ? sm[j] < leftExtr : sm[j] > leftExtr) leftExtr = sm[j];
    }
    let rightExtr = pv;
    for (let j = pi + 1; j < GRID_SIZE && GRID[j] <= fHi; j++) {
      if (isPeak ? sm[j] < rightExtr : sm[j] > rightExtr) rightExtr = sm[j];
    }

    const leftDrop  = isPeak ? pv - leftExtr  : leftExtr  - pv;
    const rightDrop = isPeak ? pv - rightExtr : rightExtr - pv;

    // Prominence = shallower of the two sides.
    const prom = Math.min(leftDrop, rightDrop);
    if (prom < threshold) return;

    // Width at local contour line (rel_height = 1.0 equivalent)
    let loIdx = pi, hiIdx = pi;
    for (let j = pi - 1; j >= 0 && GRID[j] >= fLo; j--) {
      if (isPeak ? sm[j] >= pv - prom : sm[j] <= pv + prom) loIdx = j;
      else break;
    }
    for (let j = pi + 1; j < GRID_SIZE && GRID[j] <= fHi; j++) {
      if (isPeak ? sm[j] >= pv - prom : sm[j] <= pv + prom) hiIdx = j;
      else break;
    }
    const widthOct = Math.log2(GRID[hiIdx] / GRID[loIdx]);

    const isPrimary = reg.fLo >= 1000 && reg.fHi <= 8000;
    const rw = isPrimary ? 1.2 : 1.0;
    const ww = Math.max(0.5, Math.min(1.5, Math.max(widthOct, 1 / 24) / 0.33));
    const score = prom * ww * rw;

    const kind = isPeak ? 'peak' : 'dip';
    const sev = pdSev(kind, prom);
    const adj = s.adjSev(sev);
    const rawText = s.pd[reg.key]?.[kind] ?? '';
    const text = rawText.replace('{adj}', adj);
    candidates.push({
      kind,
      fcHz, prominenceDb: prom, widthOct, score,
      region: reg.key,
      text,
      techSuffix: `（fc=${fcHz.toFixed(0)} Hz, prom=${prom.toFixed(1)} dB, width=${widthOct.toFixed(2)} oct）`,
    });
  };

  for (const pi of maxima) processExtremum(pi, true);
  for (const di of minima) processExtremum(di, false);

  candidates.sort((a, b) => b.score - a.score);
  const all = [...candidates];

  // Build selection pool: merge same-region peak+dip pairs into a single candidate.
  // `all` retains individual entries for visualization; pairs only affect narration.
  const pairedRegions = new Set<string>();
  const pairResults: PeakDipResult[] = [];

  const regionKeys = Array.from(new Set(candidates.map(c => c.region)));
  for (const region of regionKeys) {
    const pairTextTmpl = s.pdPair[region];
    if (!pairTextTmpl) continue;
    const peaks = candidates.filter(c => c.region === region && c.kind === 'peak');
    const dips  = candidates.filter(c => c.region === region && c.kind === 'dip');
    if (peaks.length === 0 || dips.length === 0) continue;
    const best = peaks[0].score >= dips[0].score ? peaks[0] : dips[0];
    const pairProm = Math.max(peaks[0].prominenceDb, dips[0].prominenceDb);
    const pairSev = pdSev('peak_dip_pair', pairProm);
    const pairAdj = s.adjSev(pairSev);
    pairedRegions.add(region);
    pairResults.push({
      kind: 'peak_dip_pair',
      fcHz: best.fcHz,
      prominenceDb: pairProm,
      widthOct: Math.max(peaks[0].widthOct, dips[0].widthOct),
      score: Math.max(peaks[0].score, dips[0].score),
      region: region as PeakDipResult['region'],
      text: pairTextTmpl.replace('{adj}', pairAdj),
      techSuffix: `（peak fc=${peaks[0].fcHz.toFixed(0)} Hz, dip fc=${dips[0].fcHz.toFixed(0)} Hz）`,
    });
  }

  const pool = [
    ...candidates.filter(c => !pairedRegions.has(c.region)),
    ...pairResults,
  ].sort((a, b) => b.score - a.score);

  // Narration selection: suppress lower-scoring candidates based on texture roughness.
  let selected: PeakDipResult[];
  if (texture.severity === 'smooth') {
    selected = pool.slice(0, 1);
  } else if (texture.severity === 'clear_rough' || texture.severity === 'severe_rough') {
    selected = pool.filter(c => c.prominenceDb >= threshold * 1.5).slice(0, 1);
  } else {
    selected = pool.slice(0, 2);
  }

  return { all, selected };
}

function analyzeBassShape(macro: Float64Array, contour: ContourResult | undefined, s: NarStrings): { text: string } | undefined {
  const b1 = rangeMean(macro, 20, 60);
  const b2 = rangeMean(macro, 60, 120);
  const b3 = rangeMean(macro, 120, 250);
  const spread = Math.max(b1, b2, b3) - Math.min(b1, b2, b3);

  // Suppress if contour already covers the pattern
  const contourCoversLow = contour && (
    contour.pattern === 'v_shape_bass_led' || contour.pattern === 'u_shape_subbass_focus'
  );

  if (b1 > 0 && b2 > 0 && b3 > 0 && spread < 1.5 && !contourCoversLow)
    return { text: s.bassShelf };
  if (b1 < 0 && b2 < 0 && b3 < 0 && spread < 1.5)
    return { text: s.bassAllBelow };
  if (b1 - b2 >= 1.5 && b1 - b3 >= 2.0 && !contourCoversLow)
    return { text: s.bassSubbass };
  if (b2 > b1 + 1.5 && b2 > b3 + 1.5)
    return { text: s.bassMidbass };
  if (b3 > b2 + 1.5)
    return { text: s.bassUpperbass };

  return undefined;
}

/* ── Narration renderer ── */

// §15.1: Only suppress bands that EXACTLY restate the contour (not all bands in that direction).
// V-shape says "mid recessed" → 1k-3k negative is a direct duplicate.
// mid_recessed says "1k-3k recessed" → same.
// inverse_v says "mid elevated" → 1k-3k positive is a direct duplicate.
// Other bands (body 200-500, 500-1k, treble 3-8k) add specificity, keep them.
function isBandDirectlyRedundant(band: BandResult, contour: ContourResult): boolean {
  const p = contour.pattern;
  if ((p === 'v_shape' || p === 'v_shape_bass_led' || p === 'v_shape_treble_led')
      && band.band === '1k_2k' && band.sign < 0) return true;
  if (p === 'mid_recessed' && band.band === '1k_2k' && band.sign < 0) return true;
  if (p === 'inverse_v' && band.band === '1k_2k' && band.sign > 0) return true;
  return false;
}

function renderNarration(
  summary: SummaryResult,
  contour: ContourResult | undefined,
  slope: SlopeResult,
  bands: BandResult[],
  texture: TextureResult,
  peaksDips: PeakDipResult[],
  bassShape: { text: string } | undefined,
  mode: RenderMode,
  length: OutputLength,
  s: NarStrings,
): { paragraphs: string[]; summaryParagraphs: string[] } {
  const cands: Candidate[] = [];

  const tech = (base: string, suf: string) => mode === 'technical' ? base + suf : base;

  // 1. Summary
  cands.push({ domain: 'summary', priority: 1, score: 100,
    text: tech(summary.text, summary.techSuffix) });

  // 2. Shape
  if (contour) {
    cands.push({ domain: 'shape', priority: 2,
      score: 60 + { severe: 30, clear: 15, slight: 5, neutral: 0 }[contour.severity],
      text: tech(contour.text, contour.techSuffix) });
  }

  // 3. Tilt/Slope
  if (slope.text && slope.severity !== 'neutral') {
    const contourStrong = contour && (contour.severity === 'clear' || contour.severity === 'severe');
    const slopeScore = { severe: 50, clear: 30, slight: 15, neutral: 0 }[slope.severity];
    if (!contourStrong || slope.severity === 'severe') {
      cands.push({ domain: 'tilt', priority: contourStrong ? 3.5 : 3, score: slopeScore,
        text: tech(slope.text, slope.techSuffix) });
    }
  }

  // 4. Band sentences — at most 1 per domain, with contour suppression
  const sevOrder = { severe: 3, clear: 2, slight: 1, neutral: 0 } as const;
  const byDomain = new Map<string, BandResult[]>();
  for (const b of bands) {
    if (b.severity === 'neutral' || !b.text) continue;
    if (!byDomain.has(b.domain)) byDomain.set(b.domain, []);
    byDomain.get(b.domain)!.push(b);
  }

  for (const [dom, domBands] of byDomain) {
    let filtered = [...domBands].sort((a, b) => sevOrder[b.severity] - sevOrder[a.severity]);
    // Suppress bands that are direct duplicates of the contour sentence (§15.1).
    // Only filter when a non-redundant alternative exists in the same domain, to avoid
    // dropping the domain entirely.
    if (contour && (contour.severity === 'clear' || contour.severity === 'severe')) {
      const nonRedundant = filtered.filter(b => !isBandDirectlyRedundant(b, contour));
      if (nonRedundant.length > 0) filtered = nonRedundant;
      // else: all bands in this domain are redundant → keep the best one for specificity
    }

    // 1k–2k and 2k–4k integration (§15.4)
    const b1k = filtered.find(b => b.band === '1k_2k');
    const b2k = filtered.find(b => b.band === '2k_4k');
    if (b1k && b2k && b1k.sign === b2k.sign && Math.abs(b1k.valueDb - b2k.valueDb) < 0.75) {
      const intText = b1k.sign > 0 ? s.integration1k2kPos : s.integration1k2kNeg;
      const ts = `（1–2k: ${b1k.valueDb >= 0 ? '+' : ''}${b1k.valueDb.toFixed(1)}, 2–4k: ${b2k.valueDb >= 0 ? '+' : ''}${b2k.valueDb.toFixed(1)} dB）`;
      cands.push({ domain: 'bodyPresence', priority: 4,
        score: (Math.abs(b1k.valueDb) + Math.abs(b2k.valueDb)) * 5,
        text: tech(intText, ts) });
      filtered = filtered.filter(b => b.band !== '1k_2k' && b.band !== '2k_4k');
    }

    if (filtered.length > 0 && filtered[0].text) {
      cands.push({ domain: dom as Candidate['domain'], priority: 4,
        score: Math.abs(filtered[0].valueDb) * 10,
        text: tech(filtered[0].text, filtered[0].techSuffix) });
    }
  }

  // Bass shape (only if no low band sentence)
  if (bassShape && !cands.some(c => c.domain === 'low')) {
    cands.push({ domain: 'low', priority: 4.5, score: 15, text: bassShape.text });
  }

  // 5. Texture — disabled: DB data is pre-smoothed, always scores smooth, not informative

  // 6. Peaks/dips
  for (const pd of peaksDips) {
    if (pd.text) {
      cands.push({ domain: 'resonance', priority: 6, score: pd.score * 8,
        text: tech(pd.text, pd.techSuffix) });
    }
  }

  // 7. Air (only if clear/severe and not already captured)
  const airBand = bands.find(b => b.band === '8k_20k');
  if (airBand && (airBand.severity === 'clear' || airBand.severity === 'severe')
      && !cands.some(c => c.domain === 'air')) {
    cands.push({ domain: 'air', priority: 7, score: Math.abs(airBand.valueDb) * 5,
      text: tech(airBand.text, airBand.techSuffix) });
  }

  // Select by domain quota
  cands.sort((a, b) => a.priority !== b.priority ? a.priority - b.priority : b.score - a.score);

  const quota: Record<string, number> = {
    summary: 1, shape: 1, tilt: 1, low: 1, bodyPresence: 1,
    treble: 1, texture: 1, resonance: 2, air: 1,
  };
  const counts: Record<string, number> = {};
  const selected: Candidate[] = [];
  const isShort = length === 'short';
  const maxTotal = isShort ? 5 : 8;

  for (const c of cands) {
    if (selected.length >= maxTotal) break;
    const cnt = counts[c.domain] ?? 0;
    if (cnt >= (quota[c.domain] ?? 1)) continue;
    // short: max 2 cause bands; full: max 3
    if (['low', 'bodyPresence', 'treble'].includes(c.domain)) {
      const causeCount = selected.filter(s => ['low', 'bodyPresence', 'treble'].includes(s.domain)).length;
      if (causeCount >= (isShort ? 2 : 3)) continue;
    }
    selected.push(c);
    counts[c.domain] = cnt + 1;
  }

  const BAND_DOMAINS = new Set(['low', 'bodyPresence', 'treble', 'air']);

  // Praise fill: ensure summaryParagraphs (non-band-domain sentences) reaches at least 3.
  // Band-domain sentences are displayed separately, so selected.length alone is not sufficient.
  // Priority order: vocal/presence region first, then treble, low, air.
  let summaryCount = selected.filter(c => !BAND_DOMAINS.has(c.domain)).length;
  if (summaryCount < 3) {
    const PRAISE_ORDER = ['1k_2k', '2k_4k', '500_1k', '4k_8k', '250_500', '120_250', '60_120', '8k_20k', '20_60'];
    for (const key of PRAISE_ORDER) {
      if (summaryCount >= 3) break;
      const band = bands.find(b => b.band === key);
      const bt = s.bandText[key];
      if (!band || !bt || band.severity !== 'neutral') continue;
      selected.push({ domain: 'praise', priority: 9, score: 0,
        text: tech(bt.praiseText, band.techSuffix) });
      summaryCount++;
    }
  }
  return {
    paragraphs: selected.map(c => c.text),
    summaryParagraphs: selected.filter(c => !BAND_DOMAINS.has(c.domain)).map(c => c.text),
  };
}

/* ── Public API ── */

/**
 * Analyze FR points against Harman target and return human-readable narration.
 * @param rawPoints  [[freqHz, dB], ...] raw measurement
 * @param category   product category (iem → in-ear, else over-ear)
 * @param mode       vocabulary mode: 'general' (default) | 'technical' (with dB annotations)
 * @param length     output length: 'short' (4–5 sentences) | 'full' (6–8, default)
 */
export function analyzeFR(
  rawPoints: [number, number][],
  category: string,
  mode: RenderMode = 'general',
  length: OutputLength = 'full',
): FRNarration {
  const s = getS();
  const frType: FrType = category === 'iem' ? 'in-ear' : 'over-ear';
  const targetCurve = getTargetCurve(category);

  const rawData = resample(rawPoints);
  const targetData = resample(targetCurve);

  const c = computeLogRmsOffset(rawData, targetData);
  const error = new Float64Array(GRID_SIZE);
  for (let i = 0; i < GRID_SIZE; i++) error[i] = rawData[i] - c - targetData[i];

  const macro = makeMacro(error);

  // residual = error - macro: captures all fine-grained deviations not absorbed by the
  // macro smoothing (~1/5 oct). Using fine-macro (3-sample vs 5-sample box) produces
  // values ~0.01–0.3 dB — far below the 1.25 dB smooth threshold and thus always "smooth".
  const residual = new Float64Array(GRID_SIZE);
  for (let i = 0; i < GRID_SIZE; i++) residual[i] = error[i] - macro[i];

  const summary  = analyzeSummary(macro, s);
  const contour  = analyzeContour(macro, frType, s);
  const slope    = analyzeSlope(macro, s);
  const bands    = analyzeBands(macro, s);
  const texture  = analyzeTexture(residual, s);
  const { all: allPeaksDips, selected: peaksDips } = analyzePeaksDips(error, texture, s);
  const bassShape = analyzeBassShape(macro, contour, s);

  const { paragraphs, summaryParagraphs } = renderNarration(summary, contour, slope, bands, texture, peaksDips, bassShape, mode, length, s);

  const bandNarrations: BandNarration[] = bands.map(b => ({
    label: b.label,
    text: b.text,
    valueDb: b.valueDb,
    severity: b.severity,
  }));

  return { paragraphs, summaryParagraphs, bandNarrations, summarySD: summary.summarySD, absSlope: summary.absSlope, allPeaksDips };
}
