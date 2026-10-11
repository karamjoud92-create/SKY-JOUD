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
  },
} as const

export type Key = keyof typeof dict.en

export function t(lang: Lang, key: Key): string {
  return dict[lang][key]
}

export function dir(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr'
}
