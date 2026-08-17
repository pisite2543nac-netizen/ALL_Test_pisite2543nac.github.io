export const CLASS_LEVELS = [
  'ปวส.1','ปวส.2','ปวส.3',
  'ปวช.1','ปวช.2','ปวช.3','ปวช.4'
];

export const CLASS_ROOMS = ['/1','/2','/3','/4','/5','/6'];

export const DEPARTMENTS = [
  {
    id: 'computer',
    name: 'คอมพิวเตอร์',
    majors: [
      { id: 'information-technology', name: 'เทคโนโลยีสารสนเทศ', code: 'ทส.' },
      { id: 'digital-business-technology', name: 'เทคโนโลยีธุรกิจดิจิทัล', code: 'ทด.' },
      { id: 'business-computer', name: 'คอมพิวเตอร์ธุรกิจ', code: 'คธ.' }
    ]
  },
  {
    id: 'electronics',
    name: 'อิเล็กทรอนิกส์',
    majors: [
      { id: 'electronics', name: 'อิเล็กทรอนิกส์', code: 'อิ.' }
    ]
  }
];

export function departmentById(id){
  return DEPARTMENTS.find(d=>d.id===id) || null;
}

export function majorById(departmentId, majorId){
  return departmentById(departmentId)?.majors.find(m=>m.id===majorId) || null;
}

export function splitLegacyClassName(className){
  const text=String(className||'').trim();
  const m=text.match(/^(ปวส\.\d|ปวช\.\d)(\/\d)$/);
  return m ? {classLevel:m[1],classRoom:m[2]} : {classLevel:text,classRoom:''};
}

export function normalizedStudentMeta(data={}){
  const legacy=splitLegacyClassName(data.className);
  return {
    classLevel: String(data.classLevel||legacy.classLevel||'').trim(),
    classRoom: String(data.classRoom||legacy.classRoom||'').trim(),
    className: String(
      data.className ||
      `${data.classLevel||legacy.classLevel||''}${data.classRoom||legacy.classRoom||''}`
    ).trim(),
    departmentId: String(data.departmentId||'').trim(),
    department: String(data.department||'').trim(),
    majorId: String(data.majorId||'').trim(),
    major: String(data.major||'').trim(),
    majorCode: String(data.majorCode||'').trim()
  };
}
