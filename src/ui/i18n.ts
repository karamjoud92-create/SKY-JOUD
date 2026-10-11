/** Minimal bilingual dictionary. Keys grow with the UI. Arabic is RTL. */
export type Lang = 'en' | 'ar'

const dict = {
  en: {
    title: 'Sky Joud Simulator',
    subtitle: 'Decision stress test: ranges, not promises',
    language: 'العربية',
    baseline: 'Do nothing',
    decision: 'Decision',
    run: 'Run',
    runs: 'Scenarios',
    horizon: 'Months',
    results: 'Results',
    assumptions: 'Assumptions the model filled in',
    loops: 'What drove the result',
    whatMustBeTrue: 'What would have to be true',
    month: 'Month',
    p10: 'Bad case (p10)',
    p50: 'Typical (p50)',
    p90: 'Good case (p90)',
    delta: 'Change vs do nothing',
    winRate: 'Share of scenarios where the decision wins',
    scenario: 'World scenario',
    sensitivity: 'Sensitivity',
    tornadoHelp: 'Each parameter swung from its low to its high value with everything else at base. Shows the change in the decision effect at the horizon.',
    wmbtHelp: 'For the decision to beat do-nothing in at least half the scenarios:',
    alwaysWins: 'wins across the whole range',
    neverWins: 'never wins inside the range',
    mustBeAbove: 'must be above',
    mustBeBelow: 'must be below',
  },
  ar: {
    title: 'محاكي سكاي جود',
    subtitle: 'اختبار ضغط للقرار: نطاقات لا وعود',
    language: 'English',
    baseline: 'بدون تغيير',
    decision: 'القرار',
    run: 'شغّل',
    runs: 'عدد السيناريوهات',
    horizon: 'الأشهر',
    results: 'النتائج',
    assumptions: 'افتراضات أكملها النموذج',
    loops: 'ما الذي صنع النتيجة',
    whatMustBeTrue: 'ما الذي يجب أن يكون صحيحاً',
    month: 'الشهر',
    p10: 'الحالة السيئة (p10)',
    p50: 'المعتاد (p50)',
    p90: 'الحالة الجيدة (p90)',
    delta: 'الفرق مقارنة ببدون تغيير',
    winRate: 'نسبة السيناريوهات التي يربح فيها القرار',
    scenario: 'سيناريو العالم',
    sensitivity: 'الحساسية',
    tornadoHelp: 'كل معامل يُحرَّك من قيمته الدنيا إلى العليا مع تثبيت الباقي. يعرض تغيّر أثر القرار عند نهاية الأفق.',
    wmbtHelp: 'كي يتفوق القرار على «بدون تغيير» في نصف السيناريوهات على الأقل:',
    alwaysWins: 'يربح في كامل النطاق',
    neverWins: 'لا يربح ضمن النطاق',
    mustBeAbove: 'يجب أن يكون فوق',
    mustBeBelow: 'يجب أن يكون تحت',
  },
} as const

export type Key = keyof typeof dict.en

export function t(lang: Lang, key: Key): string {
  return dict[lang][key]
}

export function dir(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr'
}
