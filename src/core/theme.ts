/**
 * PaperLoop Design Tokens
 * Based on the Wanted/Montage Design System (light mode)
 * https://montage.wanted.co.kr
 */

const addOpacity = (hex: string, alpha: number): string => {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
};

// Atomic palette (subset used by our semantic tokens)
const atomic = {
  common: { 0: '#000000', 100: '#FFFFFF' },
  blue: { 40: '#0054D1', 45: '#005EEB', 50: '#0066FF', 60: '#3385FF', 65: '#4F95FF', 90: '#C9DEFE', 95: '#EAF2FE', 99: '#F7FBFF' },
  coolNeutral: { 10: '#171719', 15: '#1B1C1E', 22: '#2E2F33', 25: '#37383C', 50: '#70737C', 70: '#989BA2', 96: '#E1E2E4', 97: '#EAEBEC', 98: '#F4F4F5', 99: '#F7F7F8' },
  neutral: { 10: '#171717', 99: '#F7F7F7' },
  red: { 50: '#FF1744' },
  green: { 50: '#00C853' },
  orange: { 50: '#FF9100', 90: '#FFF3E0', 95: '#FFF8E1' },
  purple: { 50: '#7C3AED', 90: '#EDE9FE', 95: '#F5F3FF' },
} as const;

export const colors = {
  primary: {
    normal: atomic.blue[50],      // #0066FF
    strong: atomic.blue[45],      // #005EEB
    heavy: atomic.blue[40],       // #0054D1
  },
  label: {
    normal: atomic.coolNeutral[10],                         // #171719
    strong: atomic.common[0],                               // #000000
    alternative: addOpacity(atomic.coolNeutral[25], 0.61),  // #37383C9C
    assistive: addOpacity(atomic.coolNeutral[25], 0.28),    // #37383C47
    disable: addOpacity(atomic.coolNeutral[25], 0.16),      // #37383C29
  },
  background: {
    normal: atomic.common[100],       // #FFFFFF
    alternative: atomic.coolNeutral[99], // #F7F7F8
  },
  fill: {
    normal: addOpacity(atomic.coolNeutral[50], 0.08),    // light tint
    strong: addOpacity(atomic.coolNeutral[50], 0.16),    // medium tint
    alternative: addOpacity(atomic.coolNeutral[50], 0.05),
  },
  line: {
    normal: atomic.coolNeutral[96],      // #E1E2E4
    neutral: atomic.coolNeutral[97],     // #EAEBEC
    alternative: atomic.coolNeutral[98], // #F4F4F5
  },
  status: {
    positive: atomic.green[50],   // #00C853
    cautionary: atomic.orange[50], // #FF9100
    negative: atomic.red[50],     // #FF1744
    negativeBg: addOpacity(atomic.red[50], 0.1),
  },
  interaction: {
    inactive: atomic.coolNeutral[70],  // #989BA2
    disable: atomic.coolNeutral[98],   // #F4F4F5
  },
  accent: {
    blue: {
      bg: atomic.blue[95],        // #EAF2FE
      bgStrong: atomic.blue[90],  // #C9DEFE
      text: atomic.blue[50],      // #0066FF
    },
    purple: {
      bg: atomic.purple[95],       // #F5F3FF
      bgStrong: atomic.purple[90], // #EDE9FE
      text: atomic.purple[50],     // #7C3AED
    },
    orange: {
      bg: atomic.orange[95],       // #FFF8E1
      bgStrong: atomic.orange[90], // #FFF3E0
      text: atomic.orange[50],     // #FF9100
    },
  },
  inverse: {
    primary: atomic.blue[60],           // #3385FF
    background: atomic.coolNeutral[15], // #1B1C1E
    label: atomic.coolNeutral[99],      // #F7F7F8
  },
  static: {
    white: atomic.common[100],
    black: atomic.common[0],
  },
} as const;

export const typography = {
  heading1: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.5 },
  heading2: { fontSize: 20, fontWeight: '700' as const },
  heading3: { fontSize: 18, fontWeight: '700' as const },
  heading4: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  bodySmall: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 11, fontWeight: '600' as const },
  label: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  button: { fontSize: 15, fontWeight: '700' as const },
  buttonSmall: { fontSize: 13, fontWeight: '600' as const },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  jumbo: 40,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

export const shadows = {
  small: {
    shadowColor: '#171717',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  medium: {
    shadowColor: '#171717',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  large: {
    shadowColor: '#171717',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;
