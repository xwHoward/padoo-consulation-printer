/**
 * 国际化（i18n）工具模块
 * 支持中文/英文切换，语言偏好持久化到本地存储
 */

export type Lang = 'zh' | 'en';

const LANG_STORAGE_KEY = 'app_lang';

// ─────────────────────────────────────────
// index 页面翻译字典
// ─────────────────────────────────────────
const indexDict: Record<string, Record<Lang, string>> = {
  // 导航栏
  refresh:          { zh: '刷新', en: 'Refresh' },
  priceList:        { zh: '价目表', en: '价目表 Price List' },
  // 人数
  guestLabel:       { zh: '顾客', en: 'Guest' },  // +序号
  mr:               { zh: '先生', en: 'Mr.' },
  ms:               { zh: '女士', en: 'Ms.' },
  // 表单区块
  project:          { zh: '项目', en: '项目Service' },
  bodyParts:        { zh: '加强部位', en: '加强部位 Focus Areas' },
  essentialOil:     { zh: '精油选择', en: 'Essential Oil' },
  exclusiveOil:     { zh: '专属精油', en: 'Exclusive Oil' },
  freeParking:      { zh: '免费停车', en: '免费停车 Free Parking' },
  licensePlate:     { zh: '车牌号', en: 'Plate No.' },
  parkingTips:      { zh: '*免费停车2小时，超时1元/小时', en: '*2h free, ¥1/h overtime' },
  clockInfo:        { zh: '上钟信息', en: '上钟信息 Clock Info' },
  technician:       { zh: '技师', en: '技师 Therapist' },
  room:             { zh: '房间', en: '房间 Room' },
  others:           { zh: '其他', en: '其他 Others' },
  surname:          { zh: '姓氏', en: '姓氏 Surname' },
  phone:            { zh: '手机号', en: '手机号 Phone' },
  phoneShared:      { zh: '手机号（共享）', en: '手机号（共享） Phone (Shared)' },
  optional:         { zh: '选填', en: 'Optional' },
  couponCode:       { zh: '券码', en: '券码 Coupon' },
  remarks:          { zh: '备注', en: '备注 Remarks' },
  // 顾客匹配
  matchedCustomer:  { zh: '匹配顾客：', en: '匹配顾客： Matched: ' },
  noPhone:          { zh: '无手机号', en: 'No phone' },
  responsibleTech:  { zh: '责任技师：', en: '责任技师： Assigned: ' },
  apply:            { zh: '应用', en: 'Apply' },
  clear:            { zh: '清除', en: 'Clear' },
  // 时间选择弹窗
  selectStartTime:  { zh: '选择上钟开始时间', en: 'Select Start Time' },
  date:             { zh: '日期', en: 'Date' },
  time:             { zh: '时间', en: 'Time' },
  // 报钟推送弹窗
  confirmClockIn:   { zh: '确认报钟信息', en: 'Confirm Clock-In' },
  pushing:          { zh: '推送中...', en: 'Pushing...' },
  noPush:           { zh: '不推送', en: 'Skip' },
  clockInPlaceholder: { zh: '请输入报钟内容', en: 'Enter clock-in content' },
  // 车牌提醒弹窗
  plateReminderTitle:  { zh: '车牌号录入提醒', en: 'Plate Reminder' },
  plateEntered:        { zh: '已录入', en: 'Got it' },
  plateReminderText:   { zh: '请在系统中及时为顾客录入车牌！', en: 'Please enter the plate number in the system!' },
  plateLabel:          { zh: '车牌号：', en: 'Plate: ' },
  // Toast / Modal 消息（TS 代码中使用）
  loading:          { zh: '加载中...', en: 'Loading...' },
  printFailed:      { zh: '打印失败', en: 'Print failed' },
  confirmRefresh:   { zh: '确认刷新', en: 'Confirm Refresh' },
  confirmReset:     { zh: '确定要重置咨询单内容吗？', en: 'Reset the consultation form?' },
  formReset:        { zh: '咨询单已重置', en: 'Form reset' },
  submitting:       { zh: '正在提交中，请勿重复点击', en: 'Submitting, please wait' },
  duplicateRecord:  { zh: '该技师在同一时间已有相同项目的记录，请勿重复报钟', en: 'Duplicate record for this therapist' },
  saveFailed:       { zh: '保存失败', en: 'Save failed' },
  customerApplied:  { zh: '已应用顾客信息', en: 'Customer info applied' },
  clockInSuccess:   { zh: '报钟成功', en: 'Clock-in success' },
  pushSuccess:      { zh: '推送成功', en: 'Push success' },
  pushFailed:       { zh: '推送失败，请重试', en: 'Push failed, retry' },
  saveGuestFailed:  { zh: '保存顾客{n}失败', en: 'Save guest {n} failed' },
  editNotFound:     { zh: '编辑记录不存在', en: 'Record not found' },
  loadFailed:       { zh: '加载失败', en: 'Load failed' },
  loadTechFailed:   { zh: '加载技师列表失败', en: 'Load therapist list failed' },
  techOccupied:     { zh: '该技师当前时段已有安排，请注意协调', en: 'Therapist is occupied at this time' },
  techConflict:     { zh: '该技师有非点钟预约冲突，请注意协调', en: 'Therapist has reservation conflict' },
  // loadingText for clock-in
  clockInLoading:   { zh: '报钟中...', en: 'Clocking...' },
  // 语言切换
  lang:             { zh: 'EN', en: '中' },
};

// ─────────────────────────────────────────
// project-list 页面翻译字典
// ─────────────────────────────────────────
const projectListDict: Record<string, Record<Lang, string>> = {
  colTime:      { zh: '时间', en: 'Time' },
  colPrice:     { zh: '费用', en: 'Price' },
  emptyData:    { zh: '暂无项目数据', en: 'No data' },
  loading:      { zh: '加载中...', en: 'Loading...' },
  extraService: { zh: '加钟', en: 'Extension' },
  loadFailed:   { zh: '加载失败', en: 'Load failed' },
  // 语言切换
  lang:         { zh: 'EN', en: '中' },
};

// ─────────────────────────────────────────
// body-selector 组件翻译字典
// ─────────────────────────────────────────
const bodySelectorDict: Record<string, Record<Lang, string>> = {
  head:     { zh: '头部', en: '头部 Head' },
  neck:     { zh: '颈部', en: '颈部 Neck' },
  shoulder: { zh: '肩部', en: '肩部 Shoulder' },
  back:     { zh: '后背', en: '后背 Back' },
  arm:      { zh: '手臂', en: '手臂 Arm' },
  abdomen:  { zh: '腹部', en: '腹部 Abdomen' },
  waist:    { zh: '腰部', en: '腰部 Waist' },
  thigh:    { zh: '大腿', en: '大腿 Thigh' },
  calf:     { zh: '小腿', en: '小腿 Calf' },
};


// ─────────────────────────────────────────
// gender-selector 组件翻译字典
// ─────────────────────────────────────────
const genderSelectorDict: Record<string, Record<Lang, string>> = {
  male:   { zh: '先生', en: 'Mr.' },
  female: { zh: '女士', en: 'Ms.' },
};

// ─────────────────────────────────────────
// platform-selector 组件翻译字典（券平台缩写）
// ─────────────────────────────────────────
const platformSelectorDict: Record<string, Record<Lang, string>> = {
  meituan:    { zh: '美', en: 'MT' },
  dianping:   { zh: '大', en: 'DP' },
  douyin:     { zh: '抖', en: 'DY' },
  wechat:     { zh: '微', en: 'WX' },
  alipay:     { zh: '支', en: 'ZFB' },
  cash:       { zh: '现', en: 'Cash' },
  gaode:      { zh: '高', en: 'GD' },
  free:       { zh: '免', en: 'Free' },
  membership: { zh: '卡', en: 'Card' },
};

// ─────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────

/** 获取当前语言 */
export function getLang(): Lang {
  return (wx.getStorageSync(LANG_STORAGE_KEY) as Lang) || 'zh';
}

/** 设置语言并持久化 */
export function setLang(lang: Lang): void {
  wx.setStorageSync(LANG_STORAGE_KEY, lang);
}

/** 切换语言，返回新语言 */
export function toggleLang(): Lang {
  const next = getLang() === 'zh' ? 'en' : 'zh';
  setLang(next);
  return next;
}

/**
 * 构建翻译对象（供页面 data.t 使用）
 * @param dictNames 要包含的字典名称列表
 */
export function buildI18nData(...dictNames: ('index' | 'projectList' | 'bodySelector' | 'genderSelector' | 'platformSelector')[]): Record<string, string> {
  const lang = getLang();
  const result: Record<string, string> = {};
  const dicts: Record<string, Record<Lang, string>>[] = [];

  if (dictNames.includes('index'))              dicts.push(indexDict);
  if (dictNames.includes('projectList'))        dicts.push(projectListDict);
  if (dictNames.includes('bodySelector'))       dicts.push(bodySelectorDict);
  if (dictNames.includes('genderSelector'))     dicts.push(genderSelectorDict);
  if (dictNames.includes('platformSelector'))   dicts.push(platformSelectorDict);

  dicts.forEach(dict => {
    Object.keys(dict).forEach(key => {
      result[key] = dict[key][lang];
    });
  });

  return result;
}

/**
 * 翻译函数（供 TS 代码中调用）
 * @param key     翻译键
 * @param params  替换 {n} 等占位符
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const lang = getLang();
  // 在所有字典中查找
  const allDicts = [indexDict, projectListDict, bodySelectorDict, genderSelectorDict, platformSelectorDict];
  for (const dict of allDicts) {
    if (dict[key]) {
      let text = dict[key][lang];
      if (params) {
        Object.keys(params).forEach(k => {
          text = text.replace(`{${k}}`, String(params[k]));
        });
      }
      return text;
    }
  }
  return key; // 找不到时返回 key 本身
}
