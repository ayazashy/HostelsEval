// ============================================================================
// 🏢 HostelsEval — Facility Templates & Deterministic Allocation Matrix
// ============================================================================

import { DefectTag, FacilityCategoryConfig } from '../types/hostel';

// 1. Comprehensive Standard Defect Dictionary
export const DEFECT_TAGS: DefectTag[] = [
  {
    id: 'leak',
    labelAr: 'تسريب مياه مستمر',
    labelEn: 'Continuous Water Leak',
    category: 'water',
    severity: 'critical',
    iconName: 'Droplet',
  },
  {
    id: 'rust',
    labelAr: 'صدأ وتكلس شديد',
    labelEn: 'Heavy Rust & Limescale',
    category: 'structural',
    severity: 'warning',
    iconName: 'ShieldAlert',
  },
  {
    id: 'broken',
    labelAr: 'مكسور أو لا يعمل',
    labelEn: 'Broken / Inoperative',
    category: 'mechanical',
    severity: 'critical',
    iconName: 'XCircle',
  },
  {
    id: 'detached',
    labelAr: 'مخلوع أو غير مثبت',
    labelEn: 'Detached / Loose',
    category: 'structural',
    severity: 'critical',
    iconName: 'Unplug',
  },
  {
    id: 'clogged',
    labelAr: 'انسداد وتجمع مياه',
    labelEn: 'Clogged Drain',
    category: 'water',
    severity: 'critical',
    iconName: 'Waves',
  },
  {
    id: 'low_pressure',
    labelAr: 'ضعف شديد بدفع المياه',
    labelEn: 'Low Water Pressure',
    category: 'water',
    severity: 'warning',
    iconName: 'Gauge',
  },
  {
    id: 'bad_odor',
    labelAr: 'رائحة كريهة مستمرة',
    labelEn: 'Foul / Stagnant Odor',
    category: 'hygiene',
    severity: 'critical',
    iconName: 'Wind',
  },
  {
    id: 'cold_heater',
    labelAr: 'الماء بارد / السخان عاطل',
    labelEn: 'Heater Not Working / Cold Water',
    category: 'electrical',
    severity: 'critical',
    iconName: 'ThermometerSnowflake',
  },
  {
    id: 'dirty_walls',
    labelAr: 'اصفرار وعفن جدران',
    labelEn: 'Yellowing / Wall Mildew',
    category: 'hygiene',
    severity: 'warning',
    iconName: 'Paintbrush',
  },
  {
    id: 'exhaust_dead',
    labelAr: 'الشفاط لا يعمل / محترق',
    labelEn: 'Exhaust Fan Dead',
    category: 'electrical',
    severity: 'warning',
    iconName: 'Fan',
  },
];

// 2. Bathroom Facility Configuration (Specific to User's Stated Dorm Structure)
// Wing 1 & Wing 2: 3 Toilets, 3 Showers, 3 Sinks, 1 Water Heater (+ General Exhaust & Floor)
// Wing 3 & Wing 4: 2 Toilets, 2 Showers, 2 Sinks, 2 Water Heaters (+ General Exhaust & Floor)
export const BATHROOM_CATEGORY_CONFIG: FacilityCategoryConfig = {
  id: 'bathrooms',
  code: 'BTH',
  nameAr: 'دورات المياه والمراوش',
  nameEn: 'Bathrooms & Showers',
  iconName: 'Bath',
  descriptionAr: 'المراحيض، المغاسل، المراوش، سخانات المياه، والتهوية',
  wingTemplates: {
    // جناح 1
    1: [
      {
        typeCode: 'TOI',
        nameAr: 'مرحاض مع سيفون وشطاف',
        nameEn: 'Toilet & Flush',
        count: 3,
        iconName: 'Toilet',
        defaultDefectTags: ['leak', 'broken', 'detached', 'clogged', 'bad_odor'],
      },
      {
        typeCode: 'SHW',
        nameAr: 'مروش ورأس شاور',
        nameEn: 'Shower & Head',
        count: 3,
        iconName: 'ShowerHead',
        defaultDefectTags: ['rust', 'detached', 'leak', 'low_pressure', 'cold_heater'],
      },
      {
        typeCode: 'SNK',
        nameAr: 'مغسلة وحنفية',
        nameEn: 'Washbasin & Faucet',
        count: 3,
        iconName: 'Sink',
        defaultDefectTags: ['leak', 'rust', 'broken', 'clogged', 'low_pressure'],
      },
      {
        typeCode: 'WHT',
        nameAr: 'سخان مياه مركزي للجناح',
        nameEn: 'Water Heater',
        count: 1,
        iconName: 'Flame',
        defaultDefectTags: ['cold_heater', 'leak', 'broken'],
      },
      {
        typeCode: 'EXH',
        nameAr: 'شفاط تهوية مركزي',
        nameEn: 'Exhaust Fan',
        count: 1,
        iconName: 'Fan',
        defaultDefectTags: ['exhaust_dead', 'bad_odor'],
      },
      {
        typeCode: 'FLR',
        nameAr: 'أرضية الحمام والتصريف',
        nameEn: 'Floor & Main Drainage',
        count: 1,
        iconName: 'Grid',
        defaultDefectTags: ['clogged', 'dirty_walls', 'bad_odor'],
      },
    ],
    // جناح 2
    2: [
      {
        typeCode: 'TOI',
        nameAr: 'مرحاض مع سيفون وشطاف',
        nameEn: 'Toilet & Flush',
        count: 3,
        iconName: 'Toilet',
        defaultDefectTags: ['leak', 'broken', 'detached', 'clogged', 'bad_odor'],
      },
      {
        typeCode: 'SHW',
        nameAr: 'مروش ورأس شاور',
        nameEn: 'Shower & Head',
        count: 3,
        iconName: 'ShowerHead',
        defaultDefectTags: ['rust', 'detached', 'leak', 'low_pressure', 'cold_heater'],
      },
      {
        typeCode: 'SNK',
        nameAr: 'مغسلة وحنفية',
        nameEn: 'Washbasin & Faucet',
        count: 3,
        iconName: 'Sink',
        defaultDefectTags: ['leak', 'rust', 'broken', 'clogged', 'low_pressure'],
      },
      {
        typeCode: 'WHT',
        nameAr: 'سخان مياه مركزي للجناح',
        nameEn: 'Water Heater',
        count: 1,
        iconName: 'Flame',
        defaultDefectTags: ['cold_heater', 'leak', 'broken'],
      },
      {
        typeCode: 'EXH',
        nameAr: 'شفاط تهوية مركزي',
        nameEn: 'Exhaust Fan',
        count: 1,
        iconName: 'Fan',
        defaultDefectTags: ['exhaust_dead', 'bad_odor'],
      },
      {
        typeCode: 'FLR',
        nameAr: 'أرضية الحمام والتصريف',
        nameEn: 'Floor & Main Drainage',
        count: 1,
        iconName: 'Grid',
        defaultDefectTags: ['clogged', 'dirty_walls', 'bad_odor'],
      },
    ],
    // جناح 3
    3: [
      {
        typeCode: 'TOI',
        nameAr: 'مرحاض مع سيفون وشطاف',
        nameEn: 'Toilet & Flush',
        count: 2,
        iconName: 'Toilet',
        defaultDefectTags: ['leak', 'broken', 'detached', 'clogged', 'bad_odor'],
      },
      {
        typeCode: 'SHW',
        nameAr: 'مروش ورأس شاور',
        nameEn: 'Shower & Head',
        count: 2,
        iconName: 'ShowerHead',
        defaultDefectTags: ['rust', 'detached', 'leak', 'low_pressure', 'cold_heater'],
      },
      {
        typeCode: 'SNK',
        nameAr: 'مغسلة وحنفية',
        nameEn: 'Washbasin & Faucet',
        count: 2,
        iconName: 'Sink',
        defaultDefectTags: ['leak', 'rust', 'broken', 'clogged', 'low_pressure'],
      },
      {
        typeCode: 'WHT',
        nameAr: 'سخانات مياه الجناح',
        nameEn: 'Water Heaters',
        count: 2,
        iconName: 'Flame',
        defaultDefectTags: ['cold_heater', 'leak', 'broken'],
      },
      {
        typeCode: 'EXH',
        nameAr: 'شفاط تهوية مركزي',
        nameEn: 'Exhaust Fan',
        count: 1,
        iconName: 'Fan',
        defaultDefectTags: ['exhaust_dead', 'bad_odor'],
      },
      {
        typeCode: 'FLR',
        nameAr: 'أرضية الحمام والتصريف',
        nameEn: 'Floor & Main Drainage',
        count: 1,
        iconName: 'Grid',
        defaultDefectTags: ['clogged', 'dirty_walls', 'bad_odor'],
      },
    ],
    // جناح 4
    4: [
      {
        typeCode: 'TOI',
        nameAr: 'مرحاض مع سيفون وشطاف',
        nameEn: 'Toilet & Flush',
        count: 2,
        iconName: 'Toilet',
        defaultDefectTags: ['leak', 'broken', 'detached', 'clogged', 'bad_odor'],
      },
      {
        typeCode: 'SHW',
        nameAr: 'مروش ورأس شاور',
        nameEn: 'Shower & Head',
        count: 2,
        iconName: 'ShowerHead',
        defaultDefectTags: ['rust', 'detached', 'leak', 'low_pressure', 'cold_heater'],
      },
      {
        typeCode: 'SNK',
        nameAr: 'مغسلة وحنفية',
        nameEn: 'Washbasin & Faucet',
        count: 2,
        iconName: 'Sink',
        defaultDefectTags: ['leak', 'rust', 'broken', 'clogged', 'low_pressure'],
      },
      {
        typeCode: 'WHT',
        nameAr: 'سخانات مياه الجناح',
        nameEn: 'Water Heaters',
        count: 2,
        iconName: 'Flame',
        defaultDefectTags: ['cold_heater', 'leak', 'broken'],
      },
      {
        typeCode: 'EXH',
        nameAr: 'شفاط تهوية مركزي',
        nameEn: 'Exhaust Fan',
        count: 1,
        iconName: 'Fan',
        defaultDefectTags: ['exhaust_dead', 'bad_odor'],
      },
      {
        typeCode: 'FLR',
        nameAr: 'أرضية الحمام والتصريف',
        nameEn: 'Floor & Main Drainage',
        count: 1,
        iconName: 'Grid',
        defaultDefectTags: ['clogged', 'dirty_walls', 'bad_odor'],
      },
    ],
  },
};

// 3. Extensible Categories Registry for Future Hostel Services
export const ALL_FACILITY_CATEGORIES: FacilityCategoryConfig[] = [
  BATHROOM_CATEGORY_CONFIG,
  // Future extension 1: Shared Kitchens (المطابخ المشتركة)
  {
    id: 'kitchens',
    code: 'KIT',
    nameAr: 'المطابخ والبوفيهات',
    nameEn: 'Shared Kitchens',
    iconName: 'Utensils',
    descriptionAr: 'عيون الغاز، المايكرويف، الثلاجات، وأحواض الجلي',
    wingTemplates: {
      1: [
        { typeCode: 'OTH', nameAr: 'عيون غاز / طباخ', nameEn: 'Stove Burners', count: 2, iconName: 'Flame', defaultDefectTags: ['broken', 'rust'] },
        { typeCode: 'OTH', nameAr: 'ثلاجة مشتركة', nameEn: 'Refrigerator', count: 1, iconName: 'Refrigerator', defaultDefectTags: ['broken', 'bad_odor'] },
        { typeCode: 'SNK', nameAr: 'حوض غسيل أواني', nameEn: 'Kitchen Sink', count: 1, iconName: 'Sink', defaultDefectTags: ['leak', 'clogged'] },
      ],
      2: [
        { typeCode: 'OTH', nameAr: 'عيون غاز / طباخ', nameEn: 'Stove Burners', count: 2, iconName: 'Flame', defaultDefectTags: ['broken', 'rust'] },
        { typeCode: 'OTH', nameAr: 'ثلاجة مشتركة', nameEn: 'Refrigerator', count: 1, iconName: 'Refrigerator', defaultDefectTags: ['broken', 'bad_odor'] },
        { typeCode: 'SNK', nameAr: 'حوض غسيل أواني', nameEn: 'Kitchen Sink', count: 1, iconName: 'Sink', defaultDefectTags: ['leak', 'clogged'] },
      ],
      3: [
        { typeCode: 'OTH', nameAr: 'عيون غاز / طباخ', nameEn: 'Stove Burners', count: 2, iconName: 'Flame', defaultDefectTags: ['broken', 'rust'] },
        { typeCode: 'OTH', nameAr: 'ثلاجة مشتركة', nameEn: 'Refrigerator', count: 1, iconName: 'Refrigerator', defaultDefectTags: ['broken', 'bad_odor'] },
        { typeCode: 'SNK', nameAr: 'حوض غسيل أواني', nameEn: 'Kitchen Sink', count: 1, iconName: 'Sink', defaultDefectTags: ['leak', 'clogged'] },
      ],
      4: [
        { typeCode: 'OTH', nameAr: 'عيون غاز / طباخ', nameEn: 'Stove Burners', count: 2, iconName: 'Flame', defaultDefectTags: ['broken', 'rust'] },
        { typeCode: 'OTH', nameAr: 'ثلاجة مشتركة', nameEn: 'Refrigerator', count: 1, iconName: 'Refrigerator', defaultDefectTags: ['broken', 'bad_odor'] },
        { typeCode: 'SNK', nameAr: 'حوض غسيل أواني', nameEn: 'Kitchen Sink', count: 1, iconName: 'Sink', defaultDefectTags: ['leak', 'clogged'] },
      ],
    },
  },
  // Future extension 2: Laundry Rooms (غرف الغسيل)
  {
    id: 'laundry',
    code: 'LND',
    nameAr: 'غرف الغسيل',
    nameEn: 'Laundry Facilities',
    iconName: 'Shirt',
    descriptionAr: 'الغسالات الأوتوماتيكية، النشافات، والتصريف',
    wingTemplates: {
      1: [
        { typeCode: 'OTH', nameAr: 'غسالة ملابس', nameEn: 'Washing Machine', count: 2, iconName: 'Shirt', defaultDefectTags: ['broken', 'leak'] },
        { typeCode: 'OTH', nameAr: 'نشافة ملابس', nameEn: 'Dryer', count: 1, iconName: 'Wind', defaultDefectTags: ['broken'] },
      ],
      2: [
        { typeCode: 'OTH', nameAr: 'غسالة ملابس', nameEn: 'Washing Machine', count: 2, iconName: 'Shirt', defaultDefectTags: ['broken', 'leak'] },
        { typeCode: 'OTH', nameAr: 'نشافة ملابس', nameEn: 'Dryer', count: 1, iconName: 'Wind', defaultDefectTags: ['broken'] },
      ],
      3: [
        { typeCode: 'OTH', nameAr: 'غسالة ملابس', nameEn: 'Washing Machine', count: 1, iconName: 'Shirt', defaultDefectTags: ['broken', 'leak'] },
        { typeCode: 'OTH', nameAr: 'نشافة ملابس', nameEn: 'Dryer', count: 1, iconName: 'Wind', defaultDefectTags: ['broken'] },
      ],
      4: [
        { typeCode: 'OTH', nameAr: 'غسالة ملابس', nameEn: 'Washing Machine', count: 1, iconName: 'Shirt', defaultDefectTags: ['broken', 'leak'] },
        { typeCode: 'OTH', nameAr: 'نشافة ملابس', nameEn: 'Dryer', count: 1, iconName: 'Wind', defaultDefectTags: ['broken'] },
      ],
    },
  },
];

// ============================================================================
// ⚙️ Dynamic Custom Facilities Manager (Admin Configurable)
// ============================================================================

const CUSTOM_FACILITIES_KEY = 'hostels_custom_facilities_config';

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
    params.wings.forEach((w) => {
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
        defaultDefectTags: params.defaultDefectTags && params.defaultDefectTags.length > 0
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
    [1, 2, 3, 4].forEach((w) => {
      if (cat.wingTemplates[w]) {
        cat.wingTemplates[w] = cat.wingTemplates[w].filter((t) => t.typeCode !== typeCode);
      }
    });
    saveActiveFacilityCategories(current);
  }

  return current;
}
