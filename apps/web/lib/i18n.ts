export const supportedLocales = ['de', 'en', 'ar'] as const;
export type Locale = (typeof supportedLocales)[number];
export const localeCookie = 'sauberwerk_locale';
type Dictionary = Record<string, string>;

export const translations: Record<Locale, Dictionary> = {
  de: {
    'nav.dashboard': 'Dashboard', 'nav.customers': 'Kunden', 'nav.objects': 'Objekte', 'nav.employees': 'Mitarbeiter', 'nav.planning': 'Planung', 'nav.jobs': 'Aufträge', 'nav.time': 'Arbeitszeiten', 'nav.complaints': 'Reklamationen', 'nav.quality': 'Qualitätskontrolle', 'nav.serviceRecords': 'Leistungsnachweise', 'nav.settings': 'Einstellungen', 'nav.myArea': 'Mein Bereich', 'nav.leave': 'Urlaub & Krankheit', 'nav.messages': 'Nachrichten', 'nav.billing': 'Abrechnung', 'nav.soon': 'Bald',
    'common.settings': 'Einstellungen', 'common.logout': 'Abmelden', 'common.menu': 'Menü öffnen', 'common.ownerAccess': 'Inhaberzugang', 'common.officeAccess': 'Bürozugang', 'common.employeeAccess': 'Mitarbeiterzugang', 'common.language': 'Sprache', 'common.german': 'Deutsch', 'common.english': 'Englisch', 'common.arabic': 'Arabisch',
    'dashboard.welcome': 'Willkommen, {name}', 'dashboard.subtitle': 'Hier sehen Sie den aktuellen Stand Ihres Betriebs.', 'dashboard.todayJobs': 'Aufträge heute', 'dashboard.activeEmployees': 'Mitarbeiter im Einsatz', 'dashboard.weekJobs': 'Aufträge diese Woche', 'dashboard.timeToday': 'Arbeitszeit heute', 'dashboard.openComplaints': 'Offene Reklamationen', 'dashboard.qualityIssues': 'Qualitätsprobleme', 'dashboard.vacationToday': 'Heute im Urlaub', 'dashboard.sickToday': 'Heute krankgemeldet', 'dashboard.affectedAbsenceJobs': 'Betroffene Aufträge', 'dashboard.openVacationRequests': 'Offene Urlaubsanträge', 'dashboard.planning': 'Operative Planung',
    'status.PLANNED': 'Geplant', 'status.CONFIRMED': 'Bestätigt', 'status.CANCELLED': 'Storniert', 'status.IN_PROGRESS': 'In Arbeit', 'status.COMPLETED': 'Abgeschlossen', 'status.MISSED': 'Verpasst', 'status.OPEN': 'Offen', 'status.RESOLVED': 'Gelöst', 'status.CLOSED': 'Geschlossen', 'status.ACTIVE': 'Aktiv', 'status.INVITED': 'Eingeladen', 'status.DISABLED': 'Deaktiviert',
    'role.OWNER': 'Inhaber', 'role.OFFICE': 'Büro', 'role.EMPLOYEE': 'Mitarbeiter', 'role.CUSTOMER': 'Kunde',
  },
  en: {
    'nav.dashboard': 'Dashboard', 'nav.customers': 'Customers', 'nav.objects': 'Sites', 'nav.employees': 'Employees', 'nav.planning': 'Planning', 'nav.jobs': 'Jobs', 'nav.time': 'Time tracking', 'nav.complaints': 'Complaints', 'nav.quality': 'Quality control', 'nav.serviceRecords': 'Service records', 'nav.settings': 'Settings', 'nav.myArea': 'My area', 'nav.leave': 'Leave & sickness', 'nav.messages': 'Messages', 'nav.billing': 'Billing', 'nav.soon': 'Coming soon',
    'common.settings': 'Settings', 'common.logout': 'Sign out', 'common.menu': 'Open menu', 'common.ownerAccess': 'Owner access', 'common.officeAccess': 'Office access', 'common.employeeAccess': 'Employee access', 'common.language': 'Language', 'common.german': 'German', 'common.english': 'English', 'common.arabic': 'Arabic',
    'dashboard.welcome': 'Welcome, {name}', 'dashboard.subtitle': 'Here is the current status of your business.', 'dashboard.todayJobs': 'Jobs today', 'dashboard.activeEmployees': 'Employees on duty', 'dashboard.weekJobs': 'Jobs this week', 'dashboard.timeToday': 'Working time today', 'dashboard.openComplaints': 'Open complaints', 'dashboard.qualityIssues': 'Quality issues', 'dashboard.vacationToday': 'On vacation today', 'dashboard.sickToday': 'Sick today', 'dashboard.affectedAbsenceJobs': 'Affected jobs', 'dashboard.openVacationRequests': 'Open vacation requests', 'dashboard.planning': 'Operational planning',
    'status.PLANNED': 'Planned', 'status.CONFIRMED': 'Confirmed', 'status.CANCELLED': 'Cancelled', 'status.IN_PROGRESS': 'In progress', 'status.COMPLETED': 'Completed', 'status.MISSED': 'Missed', 'status.OPEN': 'Open', 'status.RESOLVED': 'Resolved', 'status.CLOSED': 'Closed', 'status.ACTIVE': 'Active', 'status.INVITED': 'Invited', 'status.DISABLED': 'Disabled',
    'role.OWNER': 'Owner', 'role.OFFICE': 'Office', 'role.EMPLOYEE': 'Employee', 'role.CUSTOMER': 'Customer',
  },
  ar: {
    'nav.dashboard': 'لوحة المعلومات', 'nav.customers': 'العملاء', 'nav.objects': 'المواقع', 'nav.employees': 'الموظفون', 'nav.planning': 'التخطيط', 'nav.jobs': 'المهام', 'nav.time': 'تسجيل الوقت', 'nav.complaints': 'الشكاوى', 'nav.quality': 'مراقبة الجودة', 'nav.serviceRecords': 'سجلات الخدمة', 'nav.settings': 'الإعدادات', 'nav.myArea': 'منطقتي', 'nav.leave': 'الإجازات والمرض', 'nav.messages': 'الرسائل', 'nav.billing': 'الفوترة', 'nav.soon': 'قريباً',
    'common.settings': 'الإعدادات', 'common.logout': 'تسجيل الخروج', 'common.menu': 'فتح القائمة', 'common.ownerAccess': 'وصول المالك', 'common.officeAccess': 'وصول المكتب', 'common.employeeAccess': 'وصول الموظف', 'common.language': 'اللغة', 'common.german': 'الألمانية', 'common.english': 'الإنجليزية', 'common.arabic': 'العربية',
    'dashboard.welcome': 'مرحباً، {name}', 'dashboard.subtitle': 'هذه هي الحالة الحالية لنشاطك التجاري.', 'dashboard.todayJobs': 'مهام اليوم', 'dashboard.activeEmployees': 'الموظفون في العمل', 'dashboard.weekJobs': 'مهام هذا الأسبوع', 'dashboard.timeToday': 'وقت العمل اليوم', 'dashboard.openComplaints': 'الشكاوى المفتوحة', 'dashboard.qualityIssues': 'مشكلات الجودة', 'dashboard.vacationToday': 'في إجازة اليوم', 'dashboard.sickToday': 'في إجازة مرضية اليوم', 'dashboard.affectedAbsenceJobs': 'المهام المتأثرة', 'dashboard.openVacationRequests': 'طلبات الإجازة المفتوحة', 'dashboard.planning': 'التخطيط التشغيلي',
    'status.PLANNED': 'مخطط', 'status.CONFIRMED': 'مؤكد', 'status.CANCELLED': 'ملغى', 'status.IN_PROGRESS': 'قيد التنفيذ', 'status.COMPLETED': 'مكتمل', 'status.MISSED': 'لم يُنجز', 'status.OPEN': 'مفتوحة', 'status.RESOLVED': 'تم الحل', 'status.CLOSED': 'مغلقة', 'status.ACTIVE': 'نشط', 'status.INVITED': 'مدعو', 'status.DISABLED': 'معطل',
    'role.OWNER': 'المالك', 'role.OFFICE': 'المكتب', 'role.EMPLOYEE': 'موظف', 'role.CUSTOMER': 'عميل',
  },
};

export type TranslationKey = keyof typeof translations.de;
export function isLocale(value: string | null | undefined): value is Locale { return Boolean(value && supportedLocales.includes(value as Locale)); }
export function t(locale: Locale, key: TranslationKey | string, values: Record<string, string | number> = {}) {
  let text = translations[locale][key] ?? translations.de[key] ?? key;
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}
export function localeTag(locale: Locale) { return locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE'; }
