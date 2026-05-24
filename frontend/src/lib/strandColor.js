const STRAND_COLOR = {
  W:'#2854c5', RL:'#7a31b5', RI:'#56429a', L:'#148a7a',
  SL:'#b26b00', RF:'#4a5d23', RH:'#365d7a', RST:'#365d7a', WHST:'#2854c5',
  N:'#2854c5', A:'#7a31b5', F:'#148a7a', G:'#b26b00',
  S:'#9b3838', MP:'#56429a',
  RP:'#a86e00', NS:'#365d7a', EE:'#7a31b5', SP:'#9b3838',
  NBT:'#0e7a3e', OA:'#2854c5', MD:'#148a7a', NF:'#56429a',
  CST:'#3e6dd2', REP:'#a86e00', HI:'#7a31b5',
  Econ:'#0a6e6e', HSS:'#365d7a',
};
const NEUTRAL = '#4b5563';

export function strandColor(code, badge) {
  if (badge && STRAND_COLOR[badge]) return STRAND_COLOR[badge];
  if (!code) return NEUTRAL;
  if (code.startsWith('CCRA')) return NEUTRAL;
  const dot = code.split('.')[0];
  if (STRAND_COLOR[dot]) return STRAND_COLOR[dot];
  const cat = dot.split('-')[0];
  return STRAND_COLOR[cat] || NEUTRAL;
}

export const CONFIDENCE_COLORS = {
  high:   { fg: '#0e7a3e', bg: '#e4f5ea' },
  medium: { fg: '#a86e00', bg: '#fcf0d7' },
  low:    { fg: '#9b3838', bg: '#fbe4e4' },
};

export function confidenceColors(level) {
  return CONFIDENCE_COLORS[level] || { fg: '#4b5563', bg: '#eef1f6' };
}
