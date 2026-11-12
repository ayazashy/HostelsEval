// ============================================================================
// 🏢 HostelsEval — Standardized Intensive Maintenance & Services Matrix (V3)
// Built directly from: نطاق بلاغات الصيانة العامة.docx + Hygiene & Pest Control
// ============================================================================

import {
  DefectTag,
  FacilityCategoryConfig,
  FixtureTemplate,
  ServiceDepartment,
} from '../types/hostel';

// ----------------------------------------------------------------------------
// 1. Zone & Wing Naming Helpers (Floor 1 has Apt 1 & Apt 2 instead of Wing 4)
// ----------------------------------------------------------------------------
export const ZONE_LABELS: Record<number, { ar: string; en: string; shortAr: string }> = {
  1: { ar: 'جناح 1 (كبير)', en: 'Wing 1 (Large)', shortAr: 'جناح 1' },
  2: { ar: 'جناح 2 (كبير)', en: 'Wing 2 (Large)', shortAr: 'جناح 2' },
  3: { ar: 'جناح 3 (صغير)', en: 'Wing 3 (Small)', shortAr: 'جناح 3' },
  4: { ar: 'جناح 4 (صغير)', en: 'Wing 4 (Small)', shortAr: 'جناح 4' },
  41: { ar: 'شقة 1 (الدور الأرضي)', en: 'Apartment 1 (Ground Floor)', shortAr: 'شقة 1' },
  42: { ar: 'شقة 2 (الدور الأرضي)', en: 'Apartment 2 (Ground Floor)', shortAr: 'شقة 2' },
  5: { ar: 'مكتب الإشراف', en: 'Supervision Office', shortAr: 'مكتب الإشراف' },
  6: {
    ar: 'الصالات والممرات والدرج والمصاعد',
    en: 'Halls, Corridors, Stairs & Elevators',
    shortAr: 'الممرات والدرج والمصاعد',
  },
  7: {
    ar: 'سطح المبنى والمنطقة المحيطة',
    en: 'Building Roof & Exterior',
    shortAr: 'السطح والخارج',
  },
};

export function getZoneNameAr(wingId: number, short: boolean = false): string {
  const z = ZONE_LABELS[Number(wingId)];
  if (z) return short ? z.shortAr : z.ar;
  return `جناح ${wingId}`;
}

export function getZoneNameEn(wingId: number): string {
  return ZONE_LABELS[Number(wingId)]?.en || `Wing ${wingId}`;
}

/**
 * Returns the ordered zone IDs available on a given floor.
 * Rule: On Floor 1 (Ground Floor), Wing 4 does NOT exist; instead there are Apartment 1 (41) and Apartment 2 (42),
 * plus Supervision Office (5), Corridors/Stairs/Elevators (6), and Roof/Exterior (7).
 */
export function getZonesForFloor(floor: number, baseTowers: number[] = [1, 2, 3, 4]): number[] {
  const zones: number[] = [];
  for (const t of baseTowers) {
    if (floor === 1 && t === 4) {
      zones.push(41, 42);
    } else {
      zones.push(t);
    }
  }
  if (floor === 1 && !zones.includes(41)) {
    zones.push(41, 42);
  }
  if (floor === 1) {
    zones.push(5); // مكتب الإشراف بالدور الأرضي
  }
  zones.push(6); // الصالات والممرات والدرج والمصاعد
  zones.push(7); // سطح المبنى والمنطقة المحيطة
  return zones;
}

export const SERVICE_DEPARTMENTS: Record<
  ServiceDepartment,
  { nameAr: string; nameEn: string; portal: 'maintenance' | 'cleaning'; badgeClass: string }
> = {
  plumbing: {
    nameAr: 'قسم السباكة',
    nameEn: 'Plumbing Dept',
    portal: 'maintenance',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  carpentry_civil: {
    nameAr: 'قسم النجارة والمدني',
    nameEn: 'Carpentry & Civil Dept',
    portal: 'maintenance',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  electrical: {
    nameAr: 'قسم الكهرباء',
    nameEn: 'Electrical Dept',
    portal: 'maintenance',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  hvac_mechanical: {
    nameAr: 'قسم التكييف والميكانيكا والمصاعد',
    nameEn: 'HVAC, Mechanical & Elevators',
    portal: 'maintenance',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  cleaning: {
    nameAr: 'قسم النظافة العامة',
    nameEn: 'General Cleaning & Hygiene',
    portal: 'cleaning',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
  },
  pest_control: {
    nameAr: 'مكافحة الحشرات والقوارض',
    nameEn: 'Pest & Rodent Control',
    portal: 'cleaning',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
  },
};

// ----------------------------------------------------------------------------
// 2. Comprehensive Bilingual Defect Dictionary (Arabic + English)
// ----------------------------------------------------------------------------
export const DEFECT_TAGS: DefectTag[] = [
  // === أولاً: قسم السباكة (Plumbing) ===
  {
    id: 'plm_sink_mixer_dmg',
    labelAr: 'تضرر خلاط المغسلة',
    labelEn: 'Washbasin Mixer Damaged',
    category: 'water',
    department: 'plumbing',
    severity: 'warning',
    iconName: 'Droplet',
  },
  {
    id: 'plm_sink_mixer_leak',
    labelAr: 'تسريب من خلاط المغسلة',
    labelEn: 'Washbasin Mixer Leak',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'plm_sink_trap_leak',
    labelAr: 'تسريب من هراب المغسلة',
    labelEn: 'Sink Drain Trap Leak',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Waves',
  },
  {
    id: 'plm_sink_broken',
    labelAr: 'وجود كسر في المغسلة',
    labelEn: 'Broken Washbasin Bowl',
    category: 'structural',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'XCircle',
  },
  {
    id: 'plm_angle_valve_leak',
    labelAr: 'تسريب من محبس الزاوية',
    labelEn: 'Angle Valve Water Leak',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'plm_shattaf_leak',
    labelAr: 'تسريب من لي الشطاف',
    labelEn: 'Bidet Hose (Shattaf) Leak',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'plm_shattaf_dmg',
    labelAr: 'تضرر لي الشطاف',
    labelEn: 'Damaged Bidet Sprayer/Hose',
    category: 'water',
    department: 'plumbing',
    severity: 'warning',
    iconName: 'Wrench',
  },
  {
    id: 'plm_east_flush_leak',
    labelAr: 'تسريب من ضغاط المقعد الشرقي',
    labelEn: 'Eastern Toilet Flush Valve Leak',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'plm_east_seat_broken',
    labelAr: 'وجود كسر في المقعد الشرقي',
    labelEn: 'Broken Eastern Toilet Pan',
    category: 'structural',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'XCircle',
  },
  {
    id: 'plm_east_clog',
    labelAr: 'انسداد المقعد الشرقي',
    labelEn: 'Clogged Eastern Toilet',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Waves',
  },
  {
    id: 'plm_west_seat_broken',
    labelAr: 'وجود كسر في المقعد الإفرنجي',
    labelEn: 'Broken Western Toilet Bowl',
    category: 'structural',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'XCircle',
  },
  {
    id: 'plm_west_cover_broken',
    labelAr: 'كسر أو فقدان غطاء المقعد الإفرنجي',
    labelEn: 'Broken/Missing Toilet Seat Cover',
    category: 'structural',
    department: 'plumbing',
    severity: 'warning',
    iconName: 'Unplug',
  },
  {
    id: 'plm_west_flush_fail',
    labelAr: 'عدم ضغط سيفون المقعد الإفرنجي',
    labelEn: 'Western Toilet Flush Not Working',
    category: 'mechanical',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'XCircle',
  },
  {
    id: 'plm_west_leak',
    labelAr: 'تسريب في المقعد الإفرنجي',
    labelEn: 'Western Toilet Water Leak',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'plm_west_clog',
    labelAr: 'انسداد المقعد الإفرنجي',
    labelEn: 'Clogged Western Toilet',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Waves',
  },
  {
    id: 'plm_shw_mixer_leak',
    labelAr: 'تسريب من خلاط المروش',
    labelEn: 'Shower Mixer Water Leak',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'plm_shw_head_missing',
    labelAr: 'فقدان أو تضرر رأس المروش',
    labelEn: 'Missing or Broken Shower Head',
    category: 'water',
    department: 'plumbing',
    severity: 'warning',
    iconName: 'ShowerHead',
  },
  {
    id: 'plm_shw_tray_broken',
    labelAr: 'وجود كسر في حوض المروش',
    labelEn: 'Broken Shower Tray',
    category: 'structural',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'XCircle',
  },
  {
    id: 'plm_shw_tray_clog',
    labelAr: 'انسداد حوض المروش',
    labelEn: 'Clogged Shower Tray Drain',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Waves',
  },
  {
    id: 'plm_floor_drain_clog',
    labelAr: 'انسداد في الصفاية الأرضية',
    labelEn: 'Clogged Floor Drain',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Waves',
  },
  {
    id: 'plm_floor_drain_dmg',
    labelAr: 'تضرر أو فقدان الصفاية الأرضية',
    labelEn: 'Damaged or Missing Floor Drain Cover',
    category: 'structural',
    department: 'plumbing',
    severity: 'warning',
    iconName: 'Grid',
  },
  {
    id: 'plm_ceiling_leak',
    labelAr: 'تسرب مياه من سقف الحمام / المطبخ',
    labelEn: 'Water Leak from Ceiling',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'plm_heater_leak',
    labelAr: 'تسريب سخان المياه',
    labelEn: 'Water Heater Tank/Pipe Leak',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'plm_no_hot_water',
    labelAr: 'عدم وجود الماء الساخن',
    labelEn: 'No Hot Water from Heater',
    category: 'electrical',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'ThermometerSnowflake',
  },
  {
    id: 'plm_kit_mixer_dmg',
    labelAr: 'تضرر خلاط المجلى',
    labelEn: 'Kitchen Sink Mixer Damaged/Leaking',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'plm_kit_under_leak',
    labelAr: 'تسريب من أسفل كاونتر المجلى',
    labelEn: 'Water Leak Under Kitchen Sink Counter',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'plm_kit_sink_dmg',
    labelAr: 'وجود ضرر في حوض المجلى',
    labelEn: 'Damaged Kitchen Sink Basin',
    category: 'structural',
    department: 'plumbing',
    severity: 'warning',
    iconName: 'XCircle',
  },
  {
    id: 'plm_kit_sink_clog',
    labelAr: 'انسداد في حوض المجلى',
    labelEn: 'Clogged Kitchen Sink',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Waves',
  },
  {
    id: 'plm_roof_leak',
    labelAr: 'تسرب من سطح المبنى',
    labelEn: 'Water Leak from Building Roof',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'plm_roof_drain_clog',
    labelAr: 'تجمعات وانسدادات الصرف في سطح المبنى',
    labelEn: 'Roof Drain Blockage & Water Ponding',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Waves',
  },
  {
    id: 'plm_ext_leak',
    labelAr: 'تسرب مياه خارج المبنى',
    labelEn: 'Exterior Water Pipe Leak Around Building',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'plm_ext_drain_clog',
    labelAr: 'انسداد الصرف حول المبنى',
    labelEn: 'Blocked Exterior Drainage Around Building',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Waves',
  },

  // === ثانياً: قسم النجارة والمدني (Carpentry & Civil) ===
  {
    id: 'civ_false_ceiling',
    labelAr: 'تضرر أو سقوط السقف المستعار',
    labelEn: 'Damaged or Fallen False Ceiling Tiles',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Grid',
  },
  {
    id: 'civ_wall_tiles',
    labelAr: 'تضرر بلاط الجدران',
    labelEn: 'Broken or Loose Wall Tiles',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Grid',
  },
  {
    id: 'civ_floor_tiles',
    labelAr: 'تضرر بلاط الأرضيات',
    labelEn: 'Broken or Uneven Floor Tiles',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Grid',
  },
  {
    id: 'civ_kit_cabinets',
    labelAr: 'تضرر دواليب المطبخ أو المفصلات',
    labelEn: 'Damaged Kitchen Cabinets or Hinges',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Layers',
  },
  {
    id: 'civ_kit_marble',
    labelAr: 'تضرر رخام موقد المطبخ مع الحامل',
    labelEn: 'Damaged Kitchen Stove Marble/Stand',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Layers',
  },
  {
    id: 'civ_door_wood',
    labelAr: 'تضرر الباب (الجناح / المطبخ / الحمام / المكتب)',
    labelEn: 'Damaged Door Leaf or Frame',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Unplug',
  },
  {
    id: 'civ_door_handle_lock',
    labelAr: 'عطل مسكة الباب أو الكالون / القفل',
    labelEn: 'Broken Door Handle, Latch or Lock',
    category: 'mechanical',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Unplug',
  },
  {
    id: 'civ_bath_partition',
    labelAr: 'تضرر فواصل الحمام / الأبواب / المسكات',
    labelEn: 'Damaged Bathroom Partitions, Doors or Locks',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Layers',
  },
  {
    id: 'civ_mirror_broken',
    labelAr: 'كسر أو فقدان مرآة المغسلة',
    labelEn: 'Broken or Missing Washbasin Mirror',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'XCircle',
  },
  {
    id: 'civ_sliding_door',
    labelAr: 'عطل باب سحاب (غرفة السخان / الدرج / الصالة)',
    labelEn: 'Faulty Sliding Door (Heater Room / Stairs / Hall)',
    category: 'mechanical',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Unplug',
  },
  {
    id: 'civ_window_balcony',
    labelAr: 'تضرر النافذة / الشباك / باب البلكونة',
    labelEn: 'Damaged Window, Screen or Balcony Door',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Grid',
  },
  {
    id: 'civ_stair_handrail',
    labelAr: 'تضرر درابزين الدرج',
    labelEn: 'Damaged or Loose Stair Handrail',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'critical',
    iconName: 'ShieldAlert',
  },
  {
    id: 'civ_glass_door',
    labelAr: 'تضرر باب الزجاج (المدخل / الصالات)',
    labelEn: 'Damaged Entrance or Hall Glass Door',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'critical',
    iconName: 'XCircle',
  },
  {
    id: 'civ_service_elec_door',
    labelAr: 'تضرر أبواب الخدمات أو غرف الكهرباء',
    labelEn: 'Damaged Service or Electrical Room Door',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Unplug',
  },
  {
    id: 'civ_notice_board',
    labelAr: 'تضرر لوحة الإعلانات',
    labelEn: 'Damaged Notice Board',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Layers',
  },
  {
    id: 'civ_wall_paint',
    labelAr: 'تقشر أو تشوه دهانات الجدران',
    labelEn: 'Peeling or Damaged Wall Paint',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'warning',
    iconName: 'Paintbrush',
  },

  // === ثالثاً: قسم الكهرباء (Electrical) ===
  {
    id: 'elc_ceiling_light',
    labelAr: 'تعطل إضاءة السقف / إضاءة المغاسل',
    labelEn: 'Ceiling or Mirror Light Out',
    category: 'electrical',
    department: 'electrical',
    severity: 'warning',
    iconName: 'Zap',
  },
  {
    id: 'elc_light_switch',
    labelAr: 'تضرر أو تعطل مفتاح الإضاءة',
    labelEn: 'Broken or Faulty Light Switch',
    category: 'electrical',
    department: 'electrical',
    severity: 'warning',
    iconName: 'Zap',
  },
  {
    id: 'elc_power_socket',
    labelAr: 'تعطل أو كسر أفياش الكهرباء',
    labelEn: 'Damaged or Dead Power Socket/Outlet',
    category: 'electrical',
    department: 'electrical',
    severity: 'critical',
    iconName: 'Unplug',
  },
  {
    id: 'elc_stove_plate',
    labelAr: 'تعطل مواقد التسخين الكهربائية بالمطبخ',
    labelEn: 'Electric Kitchen Stove Burner Not Working',
    category: 'electrical',
    department: 'electrical',
    severity: 'critical',
    iconName: 'Flame',
  },
  {
    id: 'elc_stove_switch',
    labelAr: 'عطل مفتاح كهرباء مواقد التسخين',
    labelEn: 'Kitchen Stove Power Switch Faulty',
    category: 'electrical',
    department: 'electrical',
    severity: 'critical',
    iconName: 'Zap',
  },
  {
    id: 'elc_exhaust_fan',
    labelAr: 'تعطل مروحة الشفط (المطبخ / دورة المياه)',
    labelEn: 'Exhaust Fan Not Working (Kitchen / Bathroom)',
    category: 'electrical',
    department: 'electrical',
    severity: 'warning',
    iconName: 'Fan',
  },
  {
    id: 'elc_heater_switch',
    labelAr: 'عطل مفتاح أو إضاءة غرفة سخان المياه',
    labelEn: 'Water Heater Room Switch or Light Fault',
    category: 'electrical',
    department: 'electrical',
    severity: 'critical',
    iconName: 'Zap',
  },
  {
    id: 'elc_fire_detector',
    labelAr: 'عطل كاشف إنذار الحريق / كاشف حرارة المطبخ',
    labelEn: 'Fire Smoke / Kitchen Heat Detector Fault',
    category: 'electrical',
    department: 'electrical',
    severity: 'critical',
    iconName: 'ShieldAlert',
  },
  {
    id: 'elc_fire_bell',
    labelAr: 'عطل جرس إنذار الحريق',
    labelEn: 'Fire Alarm Bell Fault',
    category: 'electrical',
    department: 'electrical',
    severity: 'critical',
    iconName: 'ShieldAlert',
  },
  {
    id: 'elc_fire_breakglass',
    labelAr: 'كسر أو عطل كاسر زجاج إنذار الحريق',
    labelEn: 'Fire Alarm Break-Glass Call Point Damaged',
    category: 'electrical',
    department: 'electrical',
    severity: 'critical',
    iconName: 'ShieldAlert',
  },
  {
    id: 'elc_fire_panel',
    labelAr: 'إنذار أو عطل لوحة الحريق بمكتب الإشراف',
    labelEn: 'Main Fire Alarm Control Panel Fault',
    category: 'electrical',
    department: 'electrical',
    severity: 'critical',
    iconName: 'ShieldAlert',
  },
  {
    id: 'elc_floodlight',
    labelAr: 'تعطل كشاف إضاءة السطح / درج الطوارئ',
    labelEn: 'Roof or Emergency Stair Floodlight Out',
    category: 'electrical',
    department: 'electrical',
    severity: 'warning',
    iconName: 'Zap',
  },

  // === رابعاً: قسم التكييف والميكانيكا والمصاعد (HVAC, Mechanical & Elevators) ===
  {
    id: 'hvac_ac_drain_leak',
    labelAr: 'تسربات مياه صرف التكييف من السقف المستعار',
    labelEn: 'AC Condensate Water Leak from False Ceiling',
    category: 'mechanical',
    department: 'hvac_mechanical',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'hvac_fcu_fault',
    labelAr: 'تعطل وحدات ملف المروحة للتكييف (Fan Coil)',
    labelEn: 'AC Fan Coil Unit (FCU) Not Cooling / Faulty',
    category: 'mechanical',
    department: 'hvac_mechanical',
    severity: 'critical',
    iconName: 'Wind',
  },
  {
    id: 'hvac_fire_hose_leak',
    labelAr: 'تسريبات مياه من خراطيم وصناديق الحريق',
    labelEn: 'Water Leak from Fire Hose Reel / Cabinet',
    category: 'water',
    department: 'hvac_mechanical',
    severity: 'critical',
    iconName: 'ShieldAlert',
  },
  {
    id: 'hvac_fire_extinguisher',
    labelAr: 'نقص أو انتهاء صلاحية طفايات الحريق',
    labelEn: 'Missing, Empty or Expired Fire Extinguisher',
    category: 'mechanical',
    department: 'hvac_mechanical',
    severity: 'critical',
    iconName: 'ShieldAlert',
  },
  {
    id: 'hvac_floor5_roof_leak',
    labelAr: 'تسريبات المياه من سقف المبنى في الطابق الخامس',
    labelEn: '5th Floor Ceiling / Roof Water Leak',
    category: 'water',
    department: 'hvac_mechanical',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'hvac_elevator_breakdown',
    labelAr: 'تعطل المصعد عن العمل',
    labelEn: 'Elevator Breakdown / Out of Service',
    category: 'mechanical',
    department: 'hvac_mechanical',
    severity: 'critical',
    iconName: 'XCircle',
  },
  {
    id: 'hvac_elevator_light',
    labelAr: 'تعطل إضاءة المصعد أو أزرار الطلب',
    labelEn: 'Elevator Cabin Light or Call Buttons Faulty',
    category: 'electrical',
    department: 'hvac_mechanical',
    severity: 'warning',
    iconName: 'Zap',
  },

  // === خامساً: قسم النظافة العامة (General Cleaning & Hygiene) ===
  {
    id: 'cln_floor_dirty',
    labelAr: 'اتساخ الأرضيات أو الجدران والحاجة للغسيل',
    labelEn: 'Dirty Floors or Walls Needing Washing',
    category: 'hygiene',
    department: 'cleaning',
    severity: 'warning',
    iconName: 'Paintbrush',
  },
  {
    id: 'cln_trash_full',
    labelAr: 'تراكم النفايات وعدم تفريغ الحاويات',
    labelEn: 'Trash Accumulation / Overflowing Bins',
    category: 'hygiene',
    department: 'cleaning',
    severity: 'critical',
    iconName: 'Wind',
  },
  {
    id: 'cln_bad_odor',
    labelAr: 'انبعاث روائح كريهة والحاجة للتعقيم',
    labelEn: 'Foul Odor Needing Deep Cleaning & Sanitization',
    category: 'hygiene',
    department: 'cleaning',
    severity: 'critical',
    iconName: 'Wind',
  },
  {
    id: 'cln_sinks_mirrors',
    labelAr: 'اتساخ المغاسل والمرايا وتكلس الأملاح',
    labelEn: 'Dirty Washbasins, Mirrors & Heavy Limescale',
    category: 'hygiene',
    department: 'cleaning',
    severity: 'warning',
    iconName: 'Droplet',
  },
  {
    id: 'cln_kitchen_grease',
    labelAr: 'تراكم دهون وأوساخ في المطبخ أو المواقد',
    labelEn: 'Heavy Grease & Food Residue in Kitchen/Stoves',
    category: 'hygiene',
    department: 'cleaning',
    severity: 'warning',
    iconName: 'Flame',
  },
  {
    id: 'cln_corridor_dust',
    labelAr: 'تراكم الأتربة والأوساخ في الممرات أو الدرج',
    labelEn: 'Dust & Litter in Corridors, Halls or Stairs',
    category: 'hygiene',
    department: 'cleaning',
    severity: 'warning',
    iconName: 'Wind',
  },

  // === سادساً: قسم مكافحة الحشرات والقوارض (Pest & Rodent Control) ===
  {
    id: 'pst_cockroaches_ants',
    labelAr: 'رصد حشرات زاحفة (صراصير / نمل)',
    labelEn: 'Crawling Insects Spotted (Cockroaches / Ants)',
    category: 'hygiene',
    department: 'pest_control',
    severity: 'critical',
    iconName: 'ShieldAlert',
  },
  {
    id: 'pst_rodents_mice',
    labelAr: 'رصد قوارض (فئران / جرذان) أو آثارها 🚨',
    labelEn: 'Rodents Spotted (Mice / Rats) - Urgent',
    category: 'hygiene',
    department: 'pest_control',
    severity: 'critical',
    iconName: 'ShieldAlert',
  },
  {
    id: 'pst_flying_insects',
    labelAr: 'انتشار ذباب أو بعوض وحشرات طائرة',
    labelEn: 'Flying Insects (Flies / Mosquitoes)',
    category: 'hygiene',
    department: 'pest_control',
    severity: 'warning',
    iconName: 'Wind',
  },
  {
    id: 'pst_spray_request',
    labelAr: 'طلب رش مبيدات وقائي دوري للجناح/المرفق',
    labelEn: 'Routine Preventive Pesticide Spray Request',
    category: 'hygiene',
    department: 'pest_control',
    severity: 'warning',
    iconName: 'Droplet',
  },
  {
    id: 'pst_traps_poison',
    labelAr: 'طلب وضع مصائد قوارض وإغلاق فتحات التسرب',
    labelEn: 'Rodent Traps, Bait & Entry Hole Sealing Needed',
    category: 'hygiene',
    department: 'pest_control',
    severity: 'critical',
    iconName: 'ShieldAlert',
  },

  // === توافقية البلاغات السابقة (Legacy Tags Mapped to Departments) ===
  {
    id: 'leak',
    labelAr: 'تسريب مياه مستمر',
    labelEn: 'Continuous Water Leak',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'rust',
    labelAr: 'صدأ وتكلس شديد',
    labelEn: 'Heavy Rust & Limescale',
    category: 'structural',
    department: 'plumbing',
    severity: 'warning',
    iconName: 'ShieldAlert',
  },
  {
    id: 'broken',
    labelAr: 'مكسور أو لا يعمل',
    labelEn: 'Broken / Inoperative',
    category: 'mechanical',
    department: 'carpentry_civil',
    severity: 'critical',
    iconName: 'XCircle',
  },
  {
    id: 'detached',
    labelAr: 'مخلوع أو غير مثبت',
    labelEn: 'Detached / Loose',
    category: 'structural',
    department: 'carpentry_civil',
    severity: 'critical',
    iconName: 'Unplug',
  },
  {
    id: 'clogged',
    labelAr: 'انسداد وتجمع مياه',
    labelEn: 'Clogged Drain',
    category: 'water',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'Waves',
  },
  {
    id: 'low_pressure',
    labelAr: 'ضعف شديد بدفع المياه',
    labelEn: 'Low Water Pressure',
    category: 'water',
    department: 'plumbing',
    severity: 'warning',
    iconName: 'Gauge',
  },
  {
    id: 'bad_odor',
    labelAr: 'رائحة كريهة مستمرة',
    labelEn: 'Foul / Stagnant Odor',
    category: 'hygiene',
    department: 'cleaning',
    severity: 'critical',
    iconName: 'Wind',
  },
  {
    id: 'cold_heater',
    labelAr: 'الماء بارد / السخان عاطل',
    labelEn: 'Heater Not Working / Cold Water',
    category: 'electrical',
    department: 'plumbing',
    severity: 'critical',
    iconName: 'ThermometerSnowflake',
  },
  {
    id: 'dirty_walls',
    labelAr: 'اصفرار وعفن جدران',
    labelEn: 'Yellowing / Wall Mildew',
    category: 'hygiene',
    department: 'cleaning',
    severity: 'warning',
    iconName: 'Paintbrush',
  },
  {
    id: 'exhaust_dead',
    labelAr: 'الشفاط لا يعمل / محترق',
    labelEn: 'Exhaust Fan Dead',
    category: 'electrical',
    department: 'electrical',
    severity: 'warning',
    iconName: 'Fan',
  },
];

/**
 * Determine whether an evaluation belongs to the Cleaning/Pest portal or Maintenance portal,
 * and determine its primary ServiceDepartment.
 */
export function resolveEvaluationDepartment(item: {
  categoryCode?: string;
  fixtureTypeCode?: string;
  defects?: string[];
  maintenanceTicket?: { department?: ServiceDepartment };
}): ServiceDepartment {
  if (item.maintenanceTicket?.department) {
    return item.maintenanceTicket.department;
  }
  if (item.fixtureTypeCode === 'PST') return 'pest_control';
  if (item.categoryCode === 'CLN' || item.fixtureTypeCode === 'HYG') {
    const hasPest = (item.defects || []).some((d) => d.startsWith('pst_'));
    return hasPest ? 'pest_control' : 'cleaning';
  }
  for (const dId of item.defects || []) {
    const tag = DEFECT_TAGS.find((t) => t.id === dId);
    if (tag?.department) return tag.department;
  }
  if (item.categoryCode === 'BTH') return 'plumbing';
  if (item.categoryCode === 'KIT') return 'plumbing';
  return 'carpentry_civil';
}

export function isCleaningOrPestTicket(item: {
  categoryCode?: string;
  fixtureTypeCode?: string;
  defects?: string[];
  maintenanceTicket?: { department?: ServiceDepartment };
}): boolean {
  const dept = resolveEvaluationDepartment(item);
  return dept === 'cleaning' || dept === 'pest_control';
}

// ----------------------------------------------------------------------------
// 3. Reusable Templates per Wing / Zone Type
// ----------------------------------------------------------------------------
const LARGE_WING_BATHROOM_TEMPLATES: FixtureTemplate[] = [
  {
    typeCode: 'TOI',
    nameAr: 'مرحاض (إفرنجي/شرقي) مع سيفون وشطاف',
    nameEn: 'Toilet (Western/Eastern) & Bidet Shattaf',
    count: 3,
    iconName: 'Toilet',
    defaultDefectTags: [
      'plm_shattaf_leak',
      'plm_shattaf_dmg',
      'plm_west_flush_fail',
      'plm_west_leak',
      'plm_west_clog',
      'plm_west_seat_broken',
      'plm_west_cover_broken',
      'plm_east_flush_leak',
      'plm_east_clog',
      'plm_east_seat_broken',
      'plm_angle_valve_leak',
    ],
  },
  {
    typeCode: 'SHW',
    nameAr: 'مروش استحمام وخلاط وحوض',
    nameEn: 'Shower Mixer, Head & Tray',
    count: 3,
    iconName: 'ShowerHead',
    defaultDefectTags: [
      'plm_shw_mixer_leak',
      'plm_shw_head_missing',
      'plm_shw_tray_clog',
      'plm_shw_tray_broken',
      'plm_no_hot_water',
    ],
  },
  {
    typeCode: 'SNK',
    nameAr: 'مغسلة يدين وخلاط وهراب ومرآة',
    nameEn: 'Washbasin, Mixer, Trap & Mirror',
    count: 3,
    iconName: 'Sink',
    defaultDefectTags: [
      'plm_sink_mixer_leak',
      'plm_sink_mixer_dmg',
      'plm_sink_trap_leak',
      'plm_sink_broken',
      'plm_angle_valve_leak',
      'civ_mirror_broken',
      'elc_ceiling_light',
    ],
  },
  {
    typeCode: 'WHT',
    nameAr: 'سخان المياه المركزي وغرفة السخان',
    nameEn: 'Water Heater & Heater Room',
    count: 1,
    iconName: 'Flame',
    defaultDefectTags: [
      'plm_heater_leak',
      'plm_no_hot_water',
      'elc_heater_switch',
      'civ_door_wood',
      'civ_sliding_door',
    ],
  },
  {
    typeCode: 'EXH',
    nameAr: 'مروحة شفط وإضاءة وأفياش دورة المياه',
    nameEn: 'Bathroom Exhaust Fan, Lights & Sockets',
    count: 1,
    iconName: 'Fan',
    defaultDefectTags: [
      'elc_exhaust_fan',
      'elc_ceiling_light',
      'elc_light_switch',
      'elc_power_socket',
    ],
  },
  {
    typeCode: 'FLR',
    nameAr: 'الصفاية الأرضية، السقف المستعار، البلاط والفواصل',
    nameEn: 'Floor Drain, Ceiling, Tiles, Doors & Partitions',
    count: 1,
    iconName: 'Grid',
    defaultDefectTags: [
      'plm_floor_drain_clog',
      'plm_floor_drain_dmg',
      'plm_ceiling_leak',
      'hvac_ac_drain_leak',
      'civ_false_ceiling',
      'civ_wall_tiles',
      'civ_floor_tiles',
      'civ_bath_partition',
      'civ_door_wood',
      'civ_door_handle_lock',
    ],
  },
];

const SMALL_WING_OR_APT_BATHROOM_TEMPLATES: FixtureTemplate[] = [
  {
    typeCode: 'TOI',
    nameAr: 'مرحاض (إفرنجي/شرقي) مع سيفون وشطاف',
    nameEn: 'Toilet (Western/Eastern) & Bidet Shattaf',
    count: 2,
    iconName: 'Toilet',
    defaultDefectTags: [
      'plm_shattaf_leak',
      'plm_shattaf_dmg',
      'plm_west_flush_fail',
      'plm_west_leak',
      'plm_west_clog',
      'plm_west_seat_broken',
      'plm_west_cover_broken',
      'plm_east_flush_leak',
      'plm_east_clog',
      'plm_east_seat_broken',
      'plm_angle_valve_leak',
    ],
  },
  {
    typeCode: 'SHW',
    nameAr: 'مروش استحمام وخلاط وحوض',
    nameEn: 'Shower Mixer, Head & Tray',
    count: 2,
    iconName: 'ShowerHead',
    defaultDefectTags: [
      'plm_shw_mixer_leak',
      'plm_shw_head_missing',
      'plm_shw_tray_clog',
      'plm_shw_tray_broken',
      'plm_no_hot_water',
    ],
  },
  {
    typeCode: 'SNK',
    nameAr: 'مغسلة يدين وخلاط وهراب ومرآة',
    nameEn: 'Washbasin, Mixer, Trap & Mirror',
    count: 2,
    iconName: 'Sink',
    defaultDefectTags: [
      'plm_sink_mixer_leak',
      'plm_sink_mixer_dmg',
      'plm_sink_trap_leak',
      'plm_sink_broken',
      'plm_angle_valve_leak',
      'civ_mirror_broken',
      'elc_ceiling_light',
    ],
  },
  {
    typeCode: 'WHT',
    nameAr: 'سخان المياه وغرفة السخان',
    nameEn: 'Water Heater & Heater Room',
    count: 2,
    iconName: 'Flame',
    defaultDefectTags: [
      'plm_heater_leak',
      'plm_no_hot_water',
      'elc_heater_switch',
      'civ_sliding_door',
      'civ_door_wood',
    ],
  },
  {
    typeCode: 'EXH',
    nameAr: 'مروحة شفط وإضاءة وأفياش دورة المياه',
    nameEn: 'Bathroom Exhaust Fan, Lights & Sockets',
    count: 1,
    iconName: 'Fan',
    defaultDefectTags: [
      'elc_exhaust_fan',
      'elc_ceiling_light',
      'elc_light_switch',
      'elc_power_socket',
    ],
  },
  {
    typeCode: 'FLR',
    nameAr: 'الصفاية الأرضية، السقف المستعار، البلاط والفواصل',
    nameEn: 'Floor Drain, Ceiling, Tiles, Doors & Partitions',
    count: 1,
    iconName: 'Grid',
    defaultDefectTags: [
      'plm_floor_drain_clog',
      'plm_floor_drain_dmg',
      'plm_ceiling_leak',
      'hvac_ac_drain_leak',
      'civ_false_ceiling',
      'civ_wall_tiles',
      'civ_floor_tiles',
      'civ_bath_partition',
      'civ_door_wood',
      'civ_door_handle_lock',
    ],
  },
];

const LARGE_WING_KITCHEN_TEMPLATES: FixtureTemplate[] = [
  {
    typeCode: 'SNK',
    nameAr: 'مجلى المطبخ (الخلاط، الحوض، الكاونتر، الصفاية)',
    nameEn: 'Kitchen Sink, Mixer, Counter & Floor Drain',
    count: 1,
    iconName: 'Sink',
    defaultDefectTags: [
      'plm_kit_mixer_dmg',
      'plm_kit_under_leak',
      'plm_kit_sink_dmg',
      'plm_kit_sink_clog',
      'plm_floor_drain_clog',
      'plm_floor_drain_dmg',
      'plm_ceiling_leak',
    ],
  },
  {
    typeCode: 'STV',
    nameAr: 'مواقد التسخين الكهربائية، المفتاح، ورخام الموقد',
    nameEn: 'Electric Heating Stoves, Switch & Marble Stand',
    count: 2,
    iconName: 'Flame',
    defaultDefectTags: [
      'elc_stove_plate',
      'elc_stove_switch',
      'civ_kit_marble',
      'elc_power_socket',
    ],
  },
  {
    typeCode: 'CAB',
    nameAr: 'دواليب المطبخ، الباب، النافذة، البلاط والسقف',
    nameEn: 'Kitchen Cabinets, Door, Window, Tiles & Ceiling',
    count: 1,
    iconName: 'Layers',
    defaultDefectTags: [
      'civ_kit_cabinets',
      'civ_door_wood',
      'civ_door_handle_lock',
      'civ_window_balcony',
      'civ_false_ceiling',
      'civ_wall_tiles',
      'civ_floor_tiles',
      'hvac_ac_drain_leak',
    ],
  },
  {
    typeCode: 'KEX',
    nameAr: 'مروحة الشفط، كاشف الحرارة، الإضاءة والأفياش',
    nameEn: 'Kitchen Exhaust Fan, Heat Detector, Lights & Outlets',
    count: 1,
    iconName: 'Fan',
    defaultDefectTags: [
      'elc_exhaust_fan',
      'elc_fire_detector',
      'elc_ceiling_light',
      'elc_light_switch',
      'elc_power_socket',
    ],
  },
];

const SMALL_WING_OR_APT_KITCHEN_TEMPLATES: FixtureTemplate[] = [
  ...LARGE_WING_KITCHEN_TEMPLATES,
  {
    typeCode: 'BLC',
    nameAr: 'بلكونة المطبخ (الباب، الإضاءة، المفاتيح، الأفياش)',
    nameEn: 'Kitchen Balcony (Door, Light, Switch & Outlet)',
    count: 1,
    iconName: 'Grid',
    defaultDefectTags: [
      'civ_window_balcony',
      'civ_door_handle_lock',
      'elc_ceiling_light',
      'elc_light_switch',
      'elc_power_socket',
    ],
  },
];

const WING_CORRIDOR_HVAC_TEMPLATES: FixtureTemplate[] = [
  {
    typeCode: 'WHV',
    nameAr: 'وحدات التكييف (Fan Coil) وصرف التكييف والسقف المستعار',
    nameEn: 'Wing AC Fan Coil Units, Drain & False Ceiling',
    count: 1,
    iconName: 'Wind',
    defaultDefectTags: [
      'hvac_fcu_fault',
      'hvac_ac_drain_leak',
      'civ_false_ceiling',
    ],
  },
  {
    typeCode: 'WEL',
    nameAr: 'باب الجناح، إضاءة السقف، المفاتيح، الأفياش، وإنذار الحريق',
    nameEn: 'Wing Door, Lights, Switches, Outlets & Fire Alarm',
    count: 1,
    iconName: 'Zap',
    defaultDefectTags: [
      'civ_door_wood',
      'civ_door_handle_lock',
      'elc_ceiling_light',
      'elc_light_switch',
      'elc_power_socket',
      'elc_fire_detector',
      'elc_fire_bell',
      'elc_fire_breakglass',
    ],
  },
];

const CLEANING_AND_PEST_TEMPLATES: FixtureTemplate[] = [
  {
    typeCode: 'HYG',
    nameAr: 'النظافة العامة، غسيل الأرضيات، تفريغ النفايات والتعقيم',
    nameEn: 'General Cleaning, Floor Washing, Trash & Sanitization',
    count: 1,
    iconName: 'Sparkles',
    defaultDefectTags: [
      'cln_floor_dirty',
      'cln_trash_full',
      'cln_bad_odor',
      'cln_sinks_mirrors',
      'cln_kitchen_grease',
      'cln_corridor_dust',
    ],
  },
  {
    typeCode: 'PST',
    nameAr: 'مكافحة الحشرات والقوارض والرش الوقائي',
    nameEn: 'Pest, Insect & Rodent Control',
    count: 1,
    iconName: 'ShieldAlert',
    defaultDefectTags: [
      'pst_cockroaches_ants',
      'pst_rodents_mice',
      'pst_flying_insects',
      'pst_spray_request',
      'pst_traps_poison',
    ],
  },
];

// ----------------------------------------------------------------------------
// 4. Main Facility Categories Configuration
// ----------------------------------------------------------------------------
export const BATHROOM_CATEGORY_CONFIG: FacilityCategoryConfig = {
  id: 'bathrooms',
  code: 'BTH',
  nameAr: 'دورات المياه والمراوش',
  nameEn: 'Bathrooms & Showers',
  iconName: 'Bath',
  descriptionAr: 'المراحيض، المغاسل، المراوش، السخانات، الصفايات، الأسقف والفواصل',
  wingTemplates: {
    1: LARGE_WING_BATHROOM_TEMPLATES,
    2: LARGE_WING_BATHROOM_TEMPLATES,
    3: SMALL_WING_OR_APT_BATHROOM_TEMPLATES,
    4: SMALL_WING_OR_APT_BATHROOM_TEMPLATES,
    41: SMALL_WING_OR_APT_BATHROOM_TEMPLATES, // شقة 1 (الدور الأول)
    42: SMALL_WING_OR_APT_BATHROOM_TEMPLATES, // شقة 2 (الدور الأول)
    5: [
      // دورة مياه مكتب الإشراف
      {
        typeCode: 'TOI',
        nameAr: 'حمام مكتب الإشراف (مقعد، شطاف، مغسلة، سخان، صفاية)',
        nameEn: 'Supervision Office Bathroom',
        count: 1,
        iconName: 'Toilet',
        defaultDefectTags: [
          'plm_sink_mixer_leak',
          'plm_sink_trap_leak',
          'plm_shattaf_leak',
          'plm_west_flush_fail',
          'plm_west_clog',
          'plm_floor_drain_clog',
          'plm_heater_leak',
          'plm_no_hot_water',
          'civ_mirror_broken',
          'civ_door_wood',
          'elc_exhaust_fan',
          'elc_ceiling_light',
        ],
      },
    ],
    6: [],
    7: [],
  },
};

export const KITCHEN_CATEGORY_CONFIG: FacilityCategoryConfig = {
  id: 'kitchens',
  code: 'KIT',
  nameAr: 'المطابخ وتجهيزاتها',
  nameEn: 'Kitchens & Appliances',
  iconName: 'Utensils',
  descriptionAr: 'المجلى، مواقد التسخين، الدواليب، الشفاط، كاشف الحرارة، وبلكونة المطبخ',
  wingTemplates: {
    1: LARGE_WING_KITCHEN_TEMPLATES,
    2: LARGE_WING_KITCHEN_TEMPLATES,
    3: SMALL_WING_OR_APT_KITCHEN_TEMPLATES,
    4: SMALL_WING_OR_APT_KITCHEN_TEMPLATES,
    41: SMALL_WING_OR_APT_KITCHEN_TEMPLATES, // شقة 1
    42: SMALL_WING_OR_APT_KITCHEN_TEMPLATES, // شقة 2
    5: LARGE_WING_KITCHEN_TEMPLATES, // مطبخ مكتب الإشراف
    6: [],
    7: [],
  },
};

export const WING_AND_ZONES_CATEGORY_CONFIG: FacilityCategoryConfig = {
  id: 'wing_and_zones',
  code: 'ZNE',
  nameAr: 'التكييف والكهرباء والمدني والسلامة',
  nameEn: 'HVAC, Electrical, Civil & Fire Safety',
  iconName: 'Layers',
  descriptionAr: 'التكييف، الإضاءة، الأفياش، الأبواب، السقف المستعار، المصاعد، وإنذار الحريق',
  wingTemplates: {
    1: WING_CORRIDOR_HVAC_TEMPLATES,
    2: WING_CORRIDOR_HVAC_TEMPLATES,
    3: WING_CORRIDOR_HVAC_TEMPLATES,
    4: WING_CORRIDOR_HVAC_TEMPLATES,
    41: WING_CORRIDOR_HVAC_TEMPLATES,
    42: WING_CORRIDOR_HVAC_TEMPLATES,
    // 5: مكتب الإشراف
    5: [
      {
        typeCode: 'OFC',
        nameAr: 'مكتب الإشراف (الإضاءة، الأفياش، الباب، النافذة، السقف، التكييف)',
        nameEn: 'Supervision Office (Lights, Sockets, Door, Window, AC)',
        count: 1,
        iconName: 'Layers',
        defaultDefectTags: [
          'elc_ceiling_light',
          'elc_light_switch',
          'elc_power_socket',
          'civ_false_ceiling',
          'civ_door_wood',
          'civ_window_balcony',
          'hvac_fcu_fault',
          'hvac_ac_drain_leak',
        ],
      },
      {
        typeCode: 'FAP',
        nameAr: 'لوحة وكاشف إنذار الحريق بمكتب الإشراف',
        nameEn: 'Supervision Office Fire Alarm Control Panel & Detector',
        count: 1,
        iconName: 'ShieldAlert',
        defaultDefectTags: ['elc_fire_panel', 'elc_fire_detector', 'elc_fire_bell'],
      },
    ],
    // 6: الصالات والممرات والدرج والمصاعد
    6: [
      {
        typeCode: 'ELV',
        nameAr: 'المصاعد الكهربائية وإضاءتها',
        nameEn: 'Building Elevators & Cabin Lighting',
        count: 2,
        iconName: 'Layers',
        defaultDefectTags: ['hvac_elevator_breakdown', 'hvac_elevator_light'],
      },
      {
        typeCode: 'FIR',
        nameAr: 'صناديق وخراطيم وطفايات وإنذار الحريق بالممرات',
        nameEn: 'Fire Hose Cabinets, Extinguishers & Corridor Alarms',
        count: 1,
        iconName: 'ShieldAlert',
        defaultDefectTags: [
          'hvac_fire_hose_leak',
          'hvac_fire_extinguisher',
          'elc_fire_detector',
          'elc_fire_bell',
          'elc_fire_breakglass',
        ],
      },
      {
        typeCode: 'COR',
        nameAr: 'أبواب الصالات والمدخل والدرج، الدرابزين، السقف، البلاط والدهانات',
        nameEn: 'Corridor Doors, Stairs Handrail, Ceiling, Tiles & Paint',
        count: 1,
        iconName: 'Grid',
        defaultDefectTags: [
          'civ_false_ceiling',
          'civ_sliding_door',
          'civ_stair_handrail',
          'civ_window_balcony',
          'civ_service_elec_door',
          'civ_floor_tiles',
          'civ_glass_door',
          'civ_notice_board',
          'civ_wall_paint',
        ],
      },
      {
        typeCode: 'CEL',
        nameAr: 'إضاءة وأفياش وتكييف الصالات والممرات',
        nameEn: 'Corridor & Hall Lighting, Sockets & AC Units',
        count: 1,
        iconName: 'Zap',
        defaultDefectTags: [
          'elc_ceiling_light',
          'elc_light_switch',
          'elc_power_socket',
          'hvac_fcu_fault',
          'hvac_ac_drain_leak',
          'hvac_floor5_roof_leak',
        ],
      },
    ],
    // 7: سطح المبنى والمنطقة المحيطة به
    7: [
      {
        typeCode: 'ROF',
        nameAr: 'سطح المبنى (العزل، تسربات السطح، وتصريف مياه الأمطار)',
        nameEn: 'Building Roof (Waterproofing, Leaks & Roof Drainage)',
        count: 1,
        iconName: 'Droplet',
        defaultDefectTags: [
          'plm_roof_leak',
          'plm_roof_drain_clog',
          'hvac_floor5_roof_leak',
        ],
      },
      {
        typeCode: 'RFL',
        nameAr: 'كشافات إضاءة سطح المبنى وكشافات درج الطوارئ',
        nameEn: 'Roof & Emergency Staircase Floodlights',
        count: 1,
        iconName: 'Zap',
        defaultDefectTags: ['elc_floodlight', 'elc_light_switch'],
      },
      {
        typeCode: 'EXT',
        nameAr: 'المنطقة المحيطة بالمبنى والأعمال الخارجية والصرف',
        nameEn: 'Building Exterior Surroundings & External Drainage',
        count: 1,
        iconName: 'Waves',
        defaultDefectTags: ['plm_ext_leak', 'plm_ext_drain_clog'],
      },
    ],
  },
};

export const CLEANING_CATEGORY_CONFIG: FacilityCategoryConfig = {
  id: 'cleaning_and_pest',
  code: 'CLN',
  nameAr: 'النظافة ومكافحة الحشرات والقوارض',
  nameEn: 'Cleaning, Hygiene & Pest Control',
  iconName: 'Sparkles',
  descriptionAr: 'النظافة العامة، الحاويات، الروائح، ومكافحة الصراصير والنمل والقوارض (تتحول لبوابة الخدمات)',
  wingTemplates: {
    1: CLEANING_AND_PEST_TEMPLATES,
    2: CLEANING_AND_PEST_TEMPLATES,
    3: CLEANING_AND_PEST_TEMPLATES,
    4: CLEANING_AND_PEST_TEMPLATES,
    41: CLEANING_AND_PEST_TEMPLATES,
    42: CLEANING_AND_PEST_TEMPLATES,
    5: CLEANING_AND_PEST_TEMPLATES,
    6: CLEANING_AND_PEST_TEMPLATES,
    7: CLEANING_AND_PEST_TEMPLATES,
  },
};

export const ALL_FACILITY_CATEGORIES: FacilityCategoryConfig[] = [
  BATHROOM_CATEGORY_CONFIG,
  KITCHEN_CATEGORY_CONFIG,
  WING_AND_ZONES_CATEGORY_CONFIG,
  CLEANING_CATEGORY_CONFIG,
];

// ============================================================================
// ⚙️ Dynamic Custom Facilities Manager (V3 Storage Key)
// ============================================================================

const CUSTOM_FACILITIES_KEY = 'hostels_custom_facilities_config_v3';

export function loadActiveFacilityCategories(): FacilityCategoryConfig[] {
  try {
    const raw = localStorage.getItem(CUSTOM_FACILITIES_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to load custom facilities from storage:', err);
  }
  return ALL_FACILITY_CATEGORIES;
}

export function saveActiveFacilityCategories(categories: FacilityCategoryConfig[]): void {
  try {
    localStorage.setItem(CUSTOM_FACILITIES_KEY, JSON.stringify(categories));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hostels-facilities-updated', { detail: categories }));
    }
  } catch (err) {
    console.warn('Failed to save custom facilities to storage:', err);
  }
}

export function addNewFacilityCategory(params: {
  code: string;
  nameAr: string;
  nameEn?: string;
  descriptionAr: string;
  iconName?: string;
}): FacilityCategoryConfig[] {
  const current = loadActiveFacilityCategories();
  const cleanCode = params.code.toUpperCase().trim();
  const existing = current.find((c) => c.code === cleanCode);
  if (existing) {
    existing.nameAr = params.nameAr.trim();
    existing.descriptionAr = params.descriptionAr.trim();
  } else {
    current.push({
      id: cleanCode.toLowerCase(),
      code: cleanCode,
      nameAr: params.nameAr.trim(),
      nameEn: params.nameEn || params.nameAr.trim(),
      iconName: params.iconName || 'Layers',
      descriptionAr: params.descriptionAr.trim(),
      wingTemplates: {
        1: [],
        2: [],
        3: [],
        4: [],
        41: [],
        42: [],
        5: [],
        6: [],
        7: [],
      },
    });
  }
  saveActiveFacilityCategories(current);
  return current;
}

export function removeFacilityCategory(categoryCode: string): FacilityCategoryConfig[] {
  let current = loadActiveFacilityCategories();
  current = current.filter((c) => c.code !== categoryCode);
  saveActiveFacilityCategories(current);
  return current;
}

export function addNewFacilityItem(params: {
  categoryCode: string;
  nameAr: string;
  typeCode: string;
  count: number;
  wings: number[];
  defaultDefectTags?: string[];
}): FacilityCategoryConfig[] {
  const current = loadActiveFacilityCategories();
  const cat = current.find((c) => c.code === params.categoryCode);

  if (cat) {
    const cleanTypeCode = params.typeCode.toUpperCase().trim();
    const targetWings = params.wings.includes(4)
      ? Array.from(new Set([...params.wings, 41, 42]))
      : params.wings;

    targetWings.forEach((w) => {
      if (!cat.wingTemplates[w]) {
        cat.wingTemplates[w] = [];
      }
      const existingIdx = cat.wingTemplates[w].findIndex((t) => t.typeCode === cleanTypeCode);
      const newTemplate = {
        typeCode: cleanTypeCode,
        nameAr: params.nameAr.trim(),
        nameEn: params.nameAr.trim(),
        count: params.count,
        iconName: 'Sparkles',
        defaultDefectTags:
          params.defaultDefectTags && params.defaultDefectTags.length > 0
            ? params.defaultDefectTags
            : ['broken', 'leak', 'rust'],
      };

      if (existingIdx >= 0) {
        cat.wingTemplates[w][existingIdx] = newTemplate;
      } else {
        cat.wingTemplates[w].push(newTemplate);
      }
    });

    saveActiveFacilityCategories(current);
  }

  return current;
}

export function removeFacilityItem(categoryCode: string, typeCode: string): FacilityCategoryConfig[] {
  const current = loadActiveFacilityCategories();
  const cat = current.find((c) => c.code === categoryCode);

  if (cat) {
    [1, 2, 3, 4, 41, 42, 5, 6, 7].forEach((w) => {
      if (cat.wingTemplates[w]) {
        cat.wingTemplates[w] = cat.wingTemplates[w].filter((t) => t.typeCode !== typeCode);
      }
    });
    saveActiveFacilityCategories(current);
  }

  return current;
}
