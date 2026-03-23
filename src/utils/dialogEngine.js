/*
Dialog engine overview
Flow:
- guardrails
- direct scenario routing for strong cases
- detect domain(s)
- if multi-domain: user confirms the most relevant 1–2 domains
- search starts with original input + confirmed domains
- otherwise normal scenario flow / result flow

UI:
- Restart is shown; End is not shown
- Back returns to previous step via history stack
*/

import kb from "../data/sg_services_kb_updated.json";
import { analyzeUserIssue } from "./nlpLite";

const DEFAULT_PAGE_SIZE = 3;
const MAX_MATCHES_CAP = 80;
const HISTORY_CAP = 20;
const MAX_CONFIRMED_DOMAINS = 2;

const STOPWORDS = new Set([
  "the","a","an","to","for","and","or","of","in","on","at","is","are","am",
  "i","me","my","we","our","you","your","they","them","this","that",
  "need","help","please","can","could","want","looking","apply","get",
  "with","from","about","into","as","it","im","i'm",
  "我","我们","你","你们","需要","想","申请","帮助","怎么","如何","有没有","可以","吗","要","找","想要","一下","现在","这个","那个"
]);

const SYNONYMS = [
  {
    re: /\b(financial aid|cash help|money help|no money|broke|bills? help|overdue bills?|arrears|low income|debt|cost of living|daily expenses?|living expenses?|basic expenses?|monthly expenses?|rent\/living costs|living costs|cover my expenses?|pay my expenses?|pay my bills?|cannot afford (my )?expenses?|can't afford (my )?expenses?|money problems?|financial stress)\b/i,
    norm: "financial aid"
  },
  {
    re: /\b(housing grant|rental support|rent help|rent problem|rent arrears|cannot pay rent|can't pay rent|no place to stay|nowhere to stay|eviction|evicted|being kicked out|homeless|rough sleeping|shelter|temporary shelter|couch surfing|sleeping outside)\b/i,
    norm: "housing"
  },
  {
    re: /\b(stressed|stress|overwhelmed|anxious|anxiety|panic|panic attack|burnt out|burned out|can't cope|cannot cope|hopeless|depressed|depression|insomnia|can't sleep|cannot sleep|sleepless)\b/i,
    norm: "mental_support"
  },
  { re: /\b(healthcare|medical|sick|ill|clinic|doctor|gp|polyclinic|medicine|medication|dental)\b/i, norm: "medical" },
  { re: /\b(hospital bill|hospital bills|medical bill|medical bills|ward|a&e|emergency room|cannot afford hospital|cant afford hospital)\b/i, norm: "hospital bill" },
  { re: /\b(medical subsidy|clinic subsidy|medifund|chas|medisave|medishield)\b/i, norm: "medical" },

  {
    re: /(经济援助|现金补助|没钱|生活费|日常开销|基本开销|每月开销|账单|欠费|补贴|发放|低收入|困难|开销|付不起生活费|付不起开销|钱不够|经济压力|生活成本)/,
    norm: "financial aid"
  },
  {
    re: /(住房|租房|房租|租金补贴|被驱逐|驱逐通知|没地方住|无家可归|收容|露宿|临时安置|过渡住房)/,
    norm: "housing"
  },
  {
    re: /(压力大|很焦虑|焦虑|崩溃|扛不住|顶不住|情绪低落|抑郁|绝望|失眠|睡不着|恐慌|惊恐|心慌|呼吸不过来|想哭)/,
    norm: "mental_support"
  },
  {
    re: /(健康|生病|看病|医疗|医药费|药|药费|太贵|诊所|医生|医院账单|住院费|急诊|A&E|社工)/i,
    norm: "medical"
  }
];

const SENSITIVE_TRIGGERS = [
  /\b(suicide|kill myself|self-harm|end my life)\b/i,
  /(自杀|轻生|想不开|伤害自己|结束生命)/
];

const URGENT_TRIGGERS = [
  /\b(no place to stay today|no place to stay tonight|nowhere to stay tonight|sleeping outside|evicted today|locked out|urgent|emergency|tonight|today)\b/i,
  /(今天没地方住|今晚没地方睡|紧急|急需|被赶出来|露宿|马上需要|被锁在门外)/
];

const PII_TRIGGERS = [
  /\b[STFG]\d{7}[A-Z]\b/i,
  /\b(?:\d[ -]*?){13,19}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\+?65\s?)?(?:6|8|9)\d{3}\s?\d{4}\b/i,
  /\b(bank account|account number|routing number|iban|swift|otp|one[-\s]?time password)\b/i,
  /(银行卡|卡号|账号|银行账户|开户地址|详细地址|身份证|护照|密码|验证码)/
];

const PROFANITY_TRIGGERS = [
  /\b(fuck|fucking|shit|bitch|asshole|wtf|stfu|damn)\b/i,
  /(操|傻逼|妈的|靠北|草泥马|他妈的|滚)/
];

const LOW_INFO_PATTERNS = [
  /^[\W_]+$/i,
  /^[a-zA-Z]{1,2}$/i,
  /^\d+$/i,
  /^(ok|okay|yes|no|lol|haha|hhh|umm|uhh|test|hello|hi)$/i
];

const DOMAIN = [
  { id: "financial",  en: "Money",      zh: "钱" },
  { id: "housing",    en: "Home",       zh: "住房" },
  { id: "healthcare", en: "Health",     zh: "医疗" },
  { id: "employment", en: "Jobs",       zh: "就业" },
  { id: "education",  en: "School",     zh: "教育" },
  { id: "seniors",    en: "Seniors",    zh: "长者" },
  { id: "disability", en: "Disability", zh: "残障" },
  { id: "legal",      en: "Legal",      zh: "法律" },
  { id: "mental",     en: "Mental",     zh: "心理" }
];

const DOMAIN_PRIORITY = [
  "housing","healthcare","financial","employment","education","seniors","disability","legal","mental"
];

function langPick(lang, en, zh) {
  return lang === "zh" ? (zh || en) : (en || zh);
}

function normalizeText(raw = "") {
  let t = (raw || "").trim();
  for (const s of SYNONYMS) t = t.replace(s.re, s.norm);
  return t;
}

function tokenize(raw = "") {
  const t = normalizeText(raw)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ");
  const parts = t.split(/\s+/).filter(Boolean);
  return parts.filter(w => !STOPWORDS.has(w));
}

function containsAny(raw, regexList) {
  return regexList.some(re => re.test(raw));
}

function isLowInformationInput(raw = "") {
  const text = (raw || "").trim();
  if (!text) return true;
  if (LOW_INFO_PATTERNS.some(re => re.test(text))) return true;

  const normalized = normalizeText(text).toLowerCase();
  const tokens = tokenize(normalized);

  if (tokens.length === 0) return true;
  if (tokens.length === 1 && PROFANITY_TRIGGERS.some(re => re.test(text))) return true;

  return false;
}

function invalidInputMessage(lang) {
  const zh = lang === "zh";
  const text = zh
    ? "我暂时没法把这句话匹配到明确的求助需求。你可以换一种更具体的说法，例如“房租交不起”或“最近失业了生活费不够”，或者先点下面的主题标签。"
    : "I couldn’t match that to a clear support need. Try describing your situation in a short phrase, such as “I can’t pay my rent” or “I recently lost my job and I’m short on living expenses”, or tap one of the topic tags below.";
  return {
    role: "assistant",
    text,
    cards: [],
    quickReplies: makeQuickReplies([...topicQuickReplies(lang), ...baseNavQuickReplies(lang)])
  };
}

function domainById(id) {
  return DOMAIN.find(d => d.id === id) || null;
}

function makeQuickReplies(items) {
  return (items || []).filter(Boolean);
}

function restartQuickReply(lang) {
  return { id: "restart", label: lang === "zh" ? "重新开始" : "Restart", action: { type: "RESTART" } };
}

function escalateQuickReply(lang) {
  return { id: "escalate", label: lang === "zh" ? "转人工" : "Human Agent", action: { type: "ESCALATE" } };
}

function searchConfirmedDomainsQuickReply(lang) {
  return {
    id: "search_confirmed_domains",
    label: lang === "zh" ? "开始搜索" : "Search with selected area(s)",
    action: { type: "SEARCH_CONFIRMED_DOMAINS" }
  };
}

function baseNavQuickReplies(lang, { includeRestart = true, includeEscalate = true } = {}) {
  const arr = [];
  if (includeRestart) arr.push(restartQuickReply(lang));
  if (includeEscalate) arr.push(escalateQuickReply(lang));
  return arr;
}

function topicQuickReplies(lang) {
  return makeQuickReplies(
    DOMAIN.map(d => ({
      id: `topic_${d.id}`,
      label: langPick(lang, d.en, d.zh),
      action: { type: "SET_DOMAIN", domainId: d.id }
    }))
  );
}

function domainChoiceQuickReplies(domainIds, lang, selectedDomains = []) {
  const selected = Array.isArray(selectedDomains) ? selectedDomains : [];
  const picks = (domainIds || []).slice(0, 8).map(id => {
    const d = domainById(id);
    const isSelected = selected.includes(id);
    return {
      id: `pick_${id}`,
      label: `${isSelected ? "✓ " : ""}${d ? langPick(lang, d.en, d.zh) : id}`,
      action: { type: "TOGGLE_CONFIRMED_DOMAIN", domainId: id }
    };
  });

  const actions = [];
  if (selected.length >= 1) actions.push(searchConfirmedDomainsQuickReply(lang));

  return makeQuickReplies([
    ...picks,
    ...actions,
    ...baseNavQuickReplies(lang)
  ]);
}

function scenarioPresets(domainId, lang) {
  const zh = lang === "zh";
  const P = {
    financial: [
      zh ? "账单欠费/水电网" : "bill arrears (utilities)",
      zh ? "房租压力/生活费不足" : "rent/living costs",
      zh ? "短期紧急现金援助" : "urgent cash help",
      zh ? "低收入家庭支持" : "low-income household",
      zh ? "失业导致经济困难" : "job loss → money issues",
      zh ? "家庭有孩子/托儿费用" : "children/childcare costs",
      zh ? "长者/父母经济支持" : "support for seniors",
      zh ? "我不确定，先看官方入口" : "not sure (official entry points)"
    ],
    housing: [
      zh ? "租金欠费" : "rent arrears",
      zh ? "收到驱逐/收房通知" : "eviction notice",
      zh ? "今晚没地方住" : "no place tonight",
      zh ? "临时收容/过渡安置" : "temporary shelter",
      zh ? "申请公租/租赁支持" : "public rental support",
      zh ? "家庭冲突需要暂住" : "short stay (family conflict)",
      zh ? "需要找附近援助点" : "nearby help point",
      zh ? "我不确定，先看官方入口" : "not sure (official entry points)"
    ],
    healthcare: [
      zh ? "住院账单" : "hospital bill",
      zh ? "诊所/门诊补贴" : "clinic subsidy",
      zh ? "药费太贵（长期用药）" : "medication costs",
      zh ? "CHAS/Medifund 相关" : "CHAS / Medifund",
      zh ? "看牙/牙科费用" : "dental costs",
      zh ? "慢性病管理/复诊" : "chronic care",
      zh ? "家里有人需要护理" : "care support",
      zh ? "我不确定，先看官方入口" : "not sure (official entry points)"
    ],
    mental: [
      zh ? "焦虑/失眠" : "anxiety / insomnia",
      zh ? "压力大/情绪崩溃" : "overwhelmed / stress",
      zh ? "想找热线/倾诉" : "helpline / talk",
      zh ? "抑郁/情绪低落" : "feeling low",
      zh ? "家庭/关系冲突" : "relationship conflict",
      zh ? "工作学业压力" : "work/school stress",
      zh ? "想找附近服务（可预约）" : "nearby services",
      zh ? "我不确定，先看官方入口" : "not sure (official entry points)"
    ],
    seniors: [
      zh ? "居家照护/护理" : "home care",
      zh ? "看护者支持" : "caregiver support",
      zh ? "长者补贴/津贴" : "senior subsidies",
      zh ? "日间照护/中心服务" : "day care services",
      zh ? "行动不便/辅助需求" : "mobility support",
      zh ? "医疗+照护一起需要" : "health + care",
      zh ? "需要找附近服务点" : "nearby services",
      zh ? "我不确定，先看官方入口" : "not sure (official entry points)"
    ],
    disability: [
      zh ? "辅助器材/设备补贴" : "assistive devices",
      zh ? "残障就业支持" : "employment support",
      zh ? "照护/日间活动" : "care/day activity",
      zh ? "交通/出行支持" : "transport support",
      zh ? "训练/康复资源" : "rehab/training",
      zh ? "家庭补贴/经济支持" : "financial support",
      zh ? "需要找附近服务点" : "nearby services",
      zh ? "我不确定，先看官方入口" : "not sure (official entry points)"
    ],
    legal: [
      zh ? "法律咨询/求助" : "legal advice",
      zh ? "离婚/家庭纠纷" : "divorce/family dispute",
      zh ? "租房/住房纠纷" : "housing dispute",
      zh ? "债务/欠费纠纷" : "debt dispute",
      zh ? "雇佣/工作纠纷" : "employment dispute",
      zh ? "需要法律援助（低收入）" : "legal aid (low-income)",
      zh ? "需要官方入口/转介" : "official referral",
      zh ? "我不确定，先看官方入口" : "not sure (official entry points)"
    ],
    employment: [
      zh ? "失业/被裁员" : "unemployed / laid off",
      zh ? "想找工作/求职支持" : "job search support",
      zh ? "培训/技能提升" : "training / upskilling",
      zh ? "转行/职业咨询" : "career switching",
      zh ? "收入下降/工时减少" : "reduced income",
      zh ? "需要官方入口/转介" : "official referral",
      zh ? "我不确定，先看官方入口" : "not sure (official entry points)"
    ],
    education: [
      zh ? "学费/学校费用" : "school fees",
      zh ? "托儿/幼儿园费用" : "childcare costs",
      zh ? "课后托管/学生照护" : "student care",
      zh ? "奖学金/助学金" : "scholarships/grants",
      zh ? "特殊教育/学习支持" : "special learning support",
      zh ? "家庭经济困难影响教育" : "financial → education",
      zh ? "需要官方入口/转介" : "official referral",
      zh ? "我不确定，先看官方入口" : "not sure (official entry points)"
    ]
  };

  const list = P[domainId] || (zh ? ["我不确定"] : ["not sure"]);
  const chips = list.map((t, i) => ({
    id: `sc_${domainId}_${i}`,
    label: t,
    action: { type: "SET_QUERY", text: t }
  }));

  return makeQuickReplies([
    ...chips,
    ...baseNavQuickReplies(lang, { includeRestart: true, includeEscalate: false })
  ]);
}

function piiWarningMessage(lang) {
  const zh = lang === "zh";
  const text = zh
    ? "我可以帮你找官方信息，但请不要输入身份证号、银行卡号、地址或验证码等隐私信息。你可以点下方选项继续。"
    : "I can help, but please don’t share personal data (ID/bank/address/OTP). You can tap options below to continue.";
  return { role: "assistant", text, cards: [], quickReplies: baseNavQuickReplies(lang) };
}

function sensitiveMessage(lang) {
  const zh = lang === "zh";
  const text = zh
    ? "听起来你现在很难受。我不是紧急服务，但我想先确保你安全。\n\n如果你有立即危险或正在伤害自己，请立刻拨打新加坡紧急电话 995（救护）或 999（警方）。你也可以联系 SOS 1767（24小时）。\n\n你可以先点「心理」相关场景，我把可用资源列出来。"
    : "It sounds really hard. I’m not an emergency service, but your safety matters.\n\nIf you’re in immediate danger, call 995 (ambulance) or 999 (police) in Singapore. You can also contact SOS 1767 (24/7).\n\nTap a Mental scenario and I’ll list available resources.";
  return {
    role: "assistant",
    text,
    cards: [],
    quickReplies: makeQuickReplies([
      { id: "topic_mental", label: zh ? "心理" : "Mental", action: { type: "SET_DOMAIN", domainId: "mental" } },
      ...baseNavQuickReplies(lang)
    ])
  };
}

function urgentMessage(lang) {
  const zh = lang === "zh";
  const text = zh
    ? "收到。你可以直接点一个主题或场景，我会优先给你可联系的官方入口/热线。"
    : "Got it. Tap a topic or a scenario and I’ll prioritize official entry points / contacts.";
  return {
    role: "assistant",
    text,
    cards: [],
    quickReplies: makeQuickReplies([...topicQuickReplies(lang), ...baseNavQuickReplies(lang)])
  };
}

function outOfScopeMessage(lang) {
  const zh = lang === "zh";
  const text = zh
    ? "我目前主要协助：新加坡社会服务相关的官方项目导航（钱、住房、医疗、就业、教育、长者、残障、法律、心理）。你可以点一个主题开始。"
    : "Right now I focus on Singapore social-service guidance (Money, Home, Health, Jobs, School, Seniors, Disability, Legal, Mental). Tap a topic to start.";
  return {
    role: "assistant",
    text,
    cards: [],
    quickReplies: makeQuickReplies([...topicQuickReplies(lang), ...baseNavQuickReplies(lang)])
  };
}

function empathyStart(primary, lang, secondary = null) {
  const zh = lang === "zh";
  const p = domainById(primary);
  const s = secondary ? domainById(secondary) : null;
  if (!primary) return zh ? "收到，我来帮你梳理一下。" : "Got it — let’s sort this out.";
  if (zh) {
    if (s) return `收到。我听到你同时提到了「${langPick(lang, p?.en, p?.zh)}」和「${langPick(lang, s?.en, s?.zh)}」。我们先选一个方向。`;
    return "收到。我来帮你从官方信息里找下一步。";
  }
  if (s) return `Got it. I’m hearing both “${langPick(lang, p?.en, p?.zh)}” and “${langPick(lang, s?.en, s?.zh)}”. Let’s pick one direction first.`;
  return "Got it. I’ll help you find the next steps from official information.";
}

function mapLiteDomainToDomainId(liteDomain) {
  if (!liteDomain) return null;
  const d = String(liteDomain).toLowerCase();
  if (d.includes("housing")) return "housing";
  if (d.includes("health") || d.includes("medical")) return "healthcare";
  if (d.includes("finance") || d.includes("money") || d.includes("financial")) return "financial";
  if (d.includes("job") || d.includes("employ")) return "employment";
  if (d.includes("school") || d.includes("edu")) return "education";
  if (d.includes("senior") || d.includes("elder")) return "seniors";
  if (d.includes("disab")) return "disability";
  if (d.includes("legal")) return "legal";
  if (d.includes("mental") || d.includes("emotion") || d.includes("stress")) return "mental";
  return null;
}

function detectDomainScores(raw) {
  const t = normalizeText(raw).toLowerCase();
  const tokens = tokenize(t);
  const hints = kb?.taxonomy?.domain_synonyms || {};

  const score = {};
  for (const d of DOMAIN) score[d.id] = 0;

  for (const d of DOMAIN) {
    const syn = (hints[d.id]?.en || []).concat(hints[d.id]?.zh || []);
    for (const h of syn) {
      const hh = normalizeText(h).toLowerCase();
      if (hh && t.includes(hh)) score[d.id] += 1;
    }
  }

  for (const tok of tokens) {
    for (const d of DOMAIN) {
      const syn = (hints[d.id]?.en || []).concat(hints[d.id]?.zh || []);
      if (syn.some(h => normalizeText(h).toLowerCase().includes(tok))) score[d.id] += 1;
    }
  }

  if (/\b(daily expenses?|living expenses?|basic expenses?|monthly expenses?|cost of living|pay my bills?|cover my expenses?|financial stress|money problems?|rent\/living costs|living costs)\b/i.test(t)) {
    score.financial += 3;
  }
  if (/(生活费|日常开销|基本开销|每月开销|经济压力|钱不够|付不起.*开销|付不起.*生活费|生活成本)/.test(raw)) {
    score.financial += 3;
  }

  if (
    /\b(lost my job|job loss|laid off|unemployed|lost work|income dropped|reduced income)\b/i.test(t) &&
    /\b(daily expenses?|living expenses?|basic expenses?|monthly expenses?|cover my expenses?|pay my bills?|cost of living|financial stress|money problems?)\b/i.test(t)
  ) {
    score.financial += 4;
    score.employment += 1;
  }
  if (
    /(失业|被裁员|没工作|收入下降|工时减少)/.test(raw) &&
    /(生活费|日常开销|基本开销|每月开销|钱不够|经济压力|付不起.*开销|付不起.*生活费)/.test(raw)
  ) {
    score.financial += 4;
    score.employment += 1;
  }

  if (
    /\b(rent arrears?|can't pay rent|cannot pay rent|rent problem|eviction notice)\b/i.test(t) &&
    /\b(daily expenses?|living expenses?|cost of living|pay my bills?|money problems?)\b/i.test(t)
  ) {
    score.housing += 2;
    score.financial += 3;
  }
  if (/(房租|租金|租房)/.test(raw) && /(生活费|开销|账单|钱不够|经济压力)/.test(raw)) {
    score.housing += 2;
    score.financial += 3;
  }

  if (
    /\b(childcare|school fees|student care|children|kid|kids)\b/i.test(t) &&
    /\b(low income|daily expenses?|financial aid|money problems?|cost of living)\b/i.test(t)
  ) {
    score.financial += 2;
    score.education += 2;
  }
  if (/(孩子|小孩|托儿|学费|学校费用)/.test(raw) && /(低收入|生活费|钱不够|经济压力)/.test(raw)) {
    score.financial += 2;
    score.education += 2;
  }

  if (
    /\b(parent|parents|elderly|senior|older adult|caregiver)\b/i.test(t) &&
    /\b(financial aid|living expenses?|money problems?|cost of living)\b/i.test(t)
  ) {
    score.financial += 2;
    score.seniors += 2;
  }
  if (/(长者|老人|父母|照护者|看护)/.test(raw) && /(生活费|开销|钱不够|经济压力)/.test(raw)) {
    score.financial += 2;
    score.seniors += 2;
  }

  if (/\b(hospital bill|hospital bills|medical bill|medical bills|cannot afford hospital|cant afford hospital)\b/i.test(t)) {
    score.healthcare += 4;
  }
  if (/(医院账单|住院费|医药费太贵|医院费用)/.test(raw)) {
    score.healthcare += 4;
  }

  if (/\b(anxiety|anxious|insomnia|can't sleep|cannot sleep|panic|panic attack)\b/i.test(t)) {
    score.mental += 4;
  }
  if (/(焦虑|失眠|睡不着|惊恐|恐慌)/.test(raw)) {
    score.mental += 4;
  }

  if (/\b(overwhelmed|burnt out|burned out|too much stress|cannot cope|can't cope)\b/i.test(t)) {
    score.mental += 4;
  }
  if (/(压力大|崩溃|扛不住|顶不住|撑不住)/.test(raw)) {
    score.mental += 4;
  }

  if (/\b(tonight|today|right now|immediately|urgent|emergency)\b/.test(t) || /(今晚|今天|马上|立刻|紧急|急需)/.test(raw)) {
    if (/no place to stay|nowhere to stay|sleeping outside|evicted|locked out/.test(t) || /(没地方住|露宿|被赶出来|被锁在门外)/.test(raw)) {
      score.housing += 3;
    }
    if (/a&e|emergency room|hospital bill|severe/.test(t) || /(急诊|医院账单|住院费)/.test(raw)) {
      score.healthcare += 2;
    }
  }

  return score;
}

function pickAllDomains(scores, minScore = 2) {
  const entries = Object.entries(scores).filter(([, v]) => v >= minScore);
  entries.sort((a, b) => {
    const diff = b[1] - a[1];
    if (diff !== 0) return diff;
    return DOMAIN_PRIORITY.indexOf(a[0]) - DOMAIN_PRIORITY.indexOf(b[0]);
  });
  return entries.map(([k]) => k);
}

function pickPrimaryDomain(scores) {
  const entries = Object.entries(scores).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  entries.sort((a, b) => {
    const diff = b[1] - a[1];
    if (diff !== 0) return diff;
    return DOMAIN_PRIORITY.indexOf(a[0]) - DOMAIN_PRIORITY.indexOf(b[0]);
  });
  return entries[0][0];
}

function pickSecondaryDomain(scores, primary) {
  const entries = Object.entries(scores)
    .filter(([k, v]) => k !== primary && v > 0)
    .sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || null;
}

function softGuessDomainId(raw) {
  const t = normalizeText(raw).toLowerCase();
  const tokens = tokenize(t);
  const syn = kb?.taxonomy?.domain_synonyms || {};

  let best = { id: null, score: 0 };
  for (const d of DOMAIN) {
    const hints = (syn[d.id]?.en || []).concat(syn[d.id]?.zh || []);
    let s = 0;
    for (const h of hints) {
      const hh = normalizeText(h).toLowerCase();
      if (hh && t.includes(hh)) s += 2;
    }
    for (const tok of tokens) {
      if (hints.some(h => normalizeText(h).toLowerCase().includes(tok))) s += 1;
    }
    if (s > best.score) best = { id: d.id, score: s };
  }
  return best.score >= 2 ? best.id : null;
}

function isClearlyIrrelevantInput(raw, scores) {
  const text = (raw || "").trim();
  if (!text) return true;
  if (containsAny(text, PROFANITY_TRIGGERS)) return true;
  if (isLowInformationInput(text)) return true;

  const normalized = normalizeText(text).toLowerCase();
  const tokens = tokenize(normalized);
  const positiveScores = Object.values(scores).filter(v => v > 0);
  const maxScore = positiveScores.length ? Math.max(...positiveScores) : 0;

  if (tokens.length <= 1 && maxScore === 0) return true;

  return false;
}

function buildQueryTokensWithLite(rawQuery, lang) {
  const base = tokenize(rawQuery);
  const lite = analyzeUserIssue(rawQuery, lang === "zh" ? "zh" : "en");
  const liteWords = (lite?.keywords || [])
    .map(x => (x || "").toLowerCase().trim())
    .filter(Boolean)
    .filter(w => !STOPWORDS.has(w));
  return Array.from(new Set([...base, ...liteWords])).slice(0, 60);
}

function schemeSearchText(s) {
  const ss = s?.search || {};
  const t = `${ss.search_text_en || ""} ${ss.search_text_zh || ""}`;
  if (t.trim()) return normalizeText(t).toLowerCase();

  const sec = s?.sections || {};
  const ov = `${sec?.overview?.en || ""} ${sec?.overview?.zh || ""}`;
  const el = `${(sec?.eligibility?.en || []).join(" ")} ${(sec?.eligibility?.zh || []).join(" ")}`;
  const st = `${(sec?.steps?.en || []).join(" ")} ${(sec?.steps?.zh || []).join(" ")}`;
  const combined = `${s.name_en || ""} ${s.name_zh || ""} ${ov} ${el} ${st}`;
  return normalizeText(combined).toLowerCase();
}

function scoreScheme(tokens, scheme, domainId) {
  const hay = schemeSearchText(scheme);
  let score = 0;

  for (const tok of tokens) {
    if (!tok) continue;
    if (hay.includes(tok)) score += 3;
  }

  if (domainId && scheme?.domain_id && scheme.domain_id === domainId) score += 6;

  const nameHay = normalizeText(`${scheme.name_en || ""} ${scheme.name_zh || ""}`).toLowerCase();
  for (const tok of tokens) {
    if (!tok) continue;
    if (nameHay.includes(tok)) score += 2;
  }

  return score;
}

function domainSynonymsTokens(domainId, lang) {
  const syn = kb?.taxonomy?.domain_synonyms?.[domainId];
  const list = lang === "zh" ? (syn?.zh || []) : (syn?.en || []);
  return tokenize(list.join(" "));
}

function retrieveSchemesForOneDomain({ query, domainId, lang }) {
  const tokens0 = buildQueryTokensWithLite(query, lang);
  const schemes = kb?.schemes || [];

  const run = (tokens) => {
    const scored = schemes
      .map(s => ({ s, score: scoreScheme(tokens, s, domainId), domainId }))
      .sort((a, b) => b.score - a.score);
    return scored.filter(x => x.score > 0).slice(0, MAX_MATCHES_CAP);
  };

  let matched = run(tokens0);
  let usedUpsearch = false;

  if (matched.length === 0) {
    const broaden = domainSynonymsTokens(domainId, lang);
    const tokens1 = Array.from(new Set([...tokens0, ...broaden]));
    matched = run(tokens1);
    usedUpsearch = true;
  }

  return { matched, usedUpsearch };
}

function dedupeScoredSchemes(scoredItems) {
  const seen = new Map();
  for (const item of scoredItems) {
    const key = `${item.s?.name_en || ""}|${item.s?.name_zh || ""}|${item.s?.domain_id || ""}`;
    const prev = seen.get(key);
    if (!prev || item.score > prev.score) seen.set(key, item);
  }
  return Array.from(seen.values()).sort((a, b) => b.score - a.score);
}

function entryPointsCards(lang) {
  const eps = kb?.entry_points || [];
  return eps.map(ep => ({
    title: langPick(lang, ep.name_en, ep.name_zh),
    summary: lang === "zh" ? "官方入口/联系方式" : "Official entry point / contacts",
    blocks: [
      {
        title: lang === "zh" ? "信息" : "Info",
        list: [
          ep?.contacts?.hotline ? (lang === "zh" ? `热线：${ep.contacts.hotline}` : `Hotline: ${ep.contacts.hotline}`) : null,
          ep?.contacts?.email ? (lang === "zh" ? `邮箱：${ep.contacts.email}` : `Email: ${ep.contacts.email}`) : null
        ].filter(Boolean)
      }
    ],
    links: ep.links || []
  }));
}

function formatSchemeToCardFull(s, lang) {
  const zh = lang === "zh";
  const title = zh ? (s.name_zh || s.name_en) : (s.name_en || s.name_zh);

  const sec = s?.sections || {};
  const overview = zh
    ? (s.summary_zh || sec?.overview?.zh || "")
    : (s.summary_en || sec?.overview?.en || "");

  const eligibility = zh
    ? (s.eligibility_zh || sec?.eligibility?.zh || [])
    : (s.eligibility_en || sec?.eligibility?.en || []);

  const steps = zh
    ? (s.how_to_apply_zh || sec?.steps?.zh || [])
    : (s.how_to_apply_en || sec?.steps?.en || []);

  const docs = zh
    ? (s.docs_to_prepare_zh || [])
    : (s.docs_to_prepare_en || []);

  const links = (s.official_links || s.links || []).filter(Boolean);

  const blocks = [];
  if (Array.isArray(eligibility) && eligibility.length) {
    blocks.push({ title: zh ? "资格要点" : "Eligibility", list: eligibility });
  }
  if (Array.isArray(steps) && steps.length) {
    blocks.push({ title: zh ? "申请步骤" : "Steps", list: steps });
  }
  if (Array.isArray(docs) && docs.length) {
    blocks.push({ title: zh ? "所需材料" : "Documents to Prepare", list: docs });
  }

  return {
    title,
    summary: overview || "",
    eligibility,
    steps,
    docs,
    blocks,
    links
  };
}

function buildResultsMessage({ lang, domainId, query, offset, pageSize, secondaryDomainId = null }) {
  const zh = lang === "zh";
  const d1 = domainById(domainId);
  const d2 = secondaryDomainId ? domainById(secondaryDomainId) : null;

  const name1 = d1 ? langPick(lang, d1.en, d1.zh) : (zh ? "该主题" : "this topic");
  const name2 = d2 ? langPick(lang, d2.en, d2.zh) : null;

  let combinedMatched = [];
  let usedUpsearch = false;

  const r1 = retrieveSchemesForOneDomain({ query, domainId, lang });
  combinedMatched.push(...r1.matched);
  usedUpsearch = usedUpsearch || r1.usedUpsearch;

  if (secondaryDomainId) {
    const r2 = retrieveSchemesForOneDomain({ query, domainId: secondaryDomainId, lang });
    combinedMatched.push(...r2.matched);
    usedUpsearch = usedUpsearch || r2.usedUpsearch;
  }

  combinedMatched = dedupeScoredSchemes(combinedMatched);
  const total = combinedMatched.length;

  if (!total) {
    const text = secondaryDomainId
      ? (zh
          ? `在「${name1} / ${name2}」下暂时没有匹配到具体项目。你可以换一种描述，或先从官方入口开始。`
          : `No specific match under “${name1} / ${name2}”. Try another description, or start from official entry points.`)
      : (zh
          ? `在「${name1}」下暂时没有匹配到具体项目。你可以换一个场景点选，或先从官方入口开始（可转介/查询）。`
          : `No specific match under “${name1}”. Try another scenario, or start from official entry points (they can refer you).`);

    return {
      role: "assistant",
      text,
      cards: entryPointsCards(lang),
      quickReplies: secondaryDomainId ? baseNavQuickReplies(lang) : scenarioPresets(domainId, lang)
    };
  }

  const page = combinedMatched.slice(offset, offset + pageSize).map(x => x.s);
  const hasMore = offset + pageSize < total;
  const hint = usedUpsearch ? (zh ? "（已扩大搜索范围）" : "(broadened search applied)") : "";

  const text = secondaryDomainId
    ? (zh
        ? `我会结合你刚才的描述，并优先从「${name1} / ${name2}」这两个方向开始搜索${hint}：`
        : `I’ll use your description and start searching mainly under “${name1} / ${name2}” ${hint}:`)
    : (zh
        ? `我在「${name1}」里根据「${query}」找到这些项目${hint}：`
        : `Based on “${query}” under “${name1}” ${hint}, here are relevant schemes:`);

  const cards = page.map(s => formatSchemeToCardFull(s, lang));

  const quick = [];
  if (hasMore) quick.push({ id: "more", label: zh ? "更多" : "More", action: { type: "MORE" } });
  else quick.push({ id: "no_more", label: zh ? "没有更多" : "No more", action: { type: "NO_MORE" } });

  quick.push(...baseNavQuickReplies(lang));

  return {
    role: "assistant",
    text,
    cards,
    quickReplies: makeQuickReplies(quick)
  };
}

function snapshotState(s) {
  return {
    step: s.step,
    domainId: s.domainId,
    secondaryDomainId: s.secondaryDomainId,
    lastQuery: s.lastQuery,
    offset: s.offset,
    pageSize: s.pageSize,
    ended: s.ended,
    candidateDomains: Array.isArray(s.candidateDomains) ? [...s.candidateDomains] : [],
    confirmedDomains: Array.isArray(s.confirmedDomains) ? [...s.confirmedDomains] : []
  };
}

function withHistoryPush(next, prev) {
  const history = Array.isArray(prev.history) ? prev.history.slice() : [];
  history.push(snapshotState(prev));
  return { ...next, history: history.slice(-HISTORY_CAP) };
}

function restoreFromHistory(state) {
  const history = Array.isArray(state.history) ? state.history.slice() : [];
  if (!history.length) return { restored: null, history: [] };
  const restored = history.pop();
  return { restored, history };
}

function messageForState(state) {
  if (state.ended) return { role: "assistant", text: "", cards: [], quickReplies: [] };

  if (state.step === "choose_domain") return getInitialAssistantMessage(state.lang);

  if (state.step === "confirm_domains") {
    const lang = state.lang;
    const zh = lang === "zh";
    const candidates = Array.isArray(state.candidateDomains) ? state.candidateDomains : [];
    const confirmed = Array.isArray(state.confirmedDomains) ? state.confirmedDomains : [];

    const text = zh
      ? `你这句话里可能涉及不止一个方向。请选择你觉得目前最相关的一个到两个领域，我会结合你刚才的描述，从这些方向开始搜索。${confirmed.length ? `（已选择 ${confirmed.length} 个）` : ""}`
      : `Your message may involve more than one area. Please choose the one or two areas that feel most relevant right now, and I’ll use your description together with them to start searching.${confirmed.length ? ` (${confirmed.length} selected)` : ""}`;

    return {
      role: "assistant",
      text,
      cards: [],
      quickReplies: domainChoiceQuickReplies(candidates, lang, confirmed)
    };
  }

  if (state.step === "choose_focus") {
    const lang = state.lang;
    const zh = lang === "zh";
    const d = domainById(state.domainId);
    const title = d ? langPick(lang, d.en, d.zh) : (zh ? "该主题" : "this topic");
    const text = zh
      ? `${empathyStart(state.domainId, lang, state.secondaryDomainId)}\n\n好的，我们先从「${title}」开始。你先点一个常见情况，我就把相关项目完整信息列出来。`
      : `${empathyStart(state.domainId, lang, state.secondaryDomainId)}\n\nOK — starting with “${title}”. Tap a common scenario and I’ll return full scheme details.`;
    return { role: "assistant", text, cards: [], quickReplies: scenarioPresets(state.domainId, lang) };
  }

  if (state.step === "refine_and_show") {
    return buildResultsMessage({
      lang: state.lang,
      domainId: state.domainId,
      secondaryDomainId: state.secondaryDomainId || null,
      query: state.lastQuery || "",
      offset: state.offset || 0,
      pageSize: state.pageSize || DEFAULT_PAGE_SIZE
    });
  }

  return getInitialAssistantMessage(state.lang);
}

function detectDirectScenario(raw, lang) {
  const normalized = normalizeText(raw).toLowerCase();

  const enJobLoss = /\b(lost my job|job loss|laid off|unemployed|lost work|income dropped|reduced income)\b/i;
  const zhJobLoss = /(失业|被裁员|没工作|收入下降|工时减少)/;

  const enExpenses = /\b(daily expenses?|living expenses?|basic expenses?|monthly expenses?|cover my expenses?|pay my bills?|cost of living|financial stress|money problems?)\b/i;
  const zhExpenses = /(生活费|日常开销|基本开销|每月开销|钱不够|经济压力|付不起.*开销|付不起.*生活费|生活成本)/;

  const enRent = /\b(rent arrears?|can't pay rent|cannot pay rent|rent problem|rent stress|eviction notice)\b/i;
  const zhRent = /(房租|租金|租房|租金压力|租房压力|租金欠费|租房困难)/;

  const enUrgentCash = /\b(urgent cash|need money now|need cash now|can't pay bills|cannot pay bills|money for today|money for tonight)\b/i;
  const zhUrgentCash = /(急需现金|马上需要钱|今天没钱|今晚没钱|付不起账单|账单交不起)/;

  const enLowIncomeHousehold = /\b(low income|single parent|family expenses|support my family|household bills)\b/i;
  const zhLowIncomeHousehold = /(低收入|单亲|家庭开销|养家|家庭账单)/;

  const enChildren = /\b(childcare|children|kids|school fees|student care)\b/i;
  const zhChildren = /(孩子|小孩|托儿|学费|课后托管|学生照护)/;

  const enSenior = /\b(parent|parents|elderly|senior|older adult|caregiver)\b/i;
  const zhSenior = /(父母|老人|长者|照护者|看护)/;

  const enHospital = /\b(hospital bill|hospital bills|medical bill|medical bills|cannot afford hospital|cant afford hospital)\b/i;
  const zhHospital = /(医院账单|住院费|医院费用|医药费太贵)/;

  const enMentalSleep = /\b(anxiety|anxious|insomnia|can't sleep|cannot sleep|panic|panic attack)\b/i;
  const zhMentalSleep = /(焦虑|失眠|睡不着|惊恐|恐慌)/;

  const enMentalStress = /\b(overwhelmed|burnt out|burned out|too much stress|cannot cope|can't cope)\b/i;
  const zhMentalStress = /(压力大|崩溃|扛不住|顶不住|撑不住)/;

  if ((enJobLoss.test(normalized) || zhJobLoss.test(raw)) && (enExpenses.test(normalized) || zhExpenses.test(raw))) {
    return {
      domainId: "financial",
      secondaryDomainId: "employment",
      scenarioQuery: lang === "zh" ? "失业导致经济困难" : "job loss → money issues"
    };
  }

  if ((enRent.test(normalized) || zhRent.test(raw)) && (enExpenses.test(normalized) || zhExpenses.test(raw))) {
    return {
      domainId: "financial",
      secondaryDomainId: "housing",
      scenarioQuery: lang === "zh" ? "房租压力/生活费不足" : "rent/living costs"
    };
  }

  if (enUrgentCash.test(normalized) || zhUrgentCash.test(raw)) {
    return {
      domainId: "financial",
      secondaryDomainId: null,
      scenarioQuery: lang === "zh" ? "短期紧急现金援助" : "urgent cash help"
    };
  }

  if ((enLowIncomeHousehold.test(normalized) || zhLowIncomeHousehold.test(raw)) && (enChildren.test(normalized) || zhChildren.test(raw))) {
    return {
      domainId: "financial",
      secondaryDomainId: "education",
      scenarioQuery: lang === "zh" ? "低收入家庭支持" : "low-income household"
    };
  }

  if ((enSenior.test(normalized) || zhSenior.test(raw)) && (enExpenses.test(normalized) || zhExpenses.test(raw))) {
    return {
      domainId: "financial",
      secondaryDomainId: "seniors",
      scenarioQuery: lang === "zh" ? "长者/父母经济支持" : "support for seniors"
    };
  }

  if (enHospital.test(normalized) || zhHospital.test(raw)) {
    return {
      domainId: "healthcare",
      secondaryDomainId: null,
      scenarioQuery: lang === "zh" ? "住院账单" : "hospital bill"
    };
  }

  if (enMentalSleep.test(normalized) || zhMentalSleep.test(raw)) {
    return {
      domainId: "mental",
      secondaryDomainId: null,
      scenarioQuery: lang === "zh" ? "焦虑/失眠" : "anxiety / insomnia"
    };
  }

  if (enMentalStress.test(normalized) || zhMentalStress.test(raw)) {
    return {
      domainId: "mental",
      secondaryDomainId: null,
      scenarioQuery: lang === "zh" ? "压力大/情绪崩溃" : "overwhelmed / stress"
    };
  }

  return null;
}

export function initDialogState(lang = "en") {
  return {
    lang,
    step: "choose_domain",
    domainId: null,
    secondaryDomainId: null,
    lastQuery: "",
    offset: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    ended: false,
    history: [],
    candidateDomains: [],
    confirmedDomains: []
  };
}

export function getInitialAssistantMessage(lang = "en") {
  const zh = lang === "zh";
  const text = zh
    ? "你好！你可以直接说一句你的情况（例如：‘租金欠费 + 医药费太贵’）。如果一句话里同时有多个方向，我会先给你多个标签让你选要先展开哪个。\n\n你想先从哪一类开始？"
    : "Hi! Describe your situation in one sentence (e.g., ‘rent arrears + medical bills’). If it matches multiple areas, I’ll show multiple tags so you can pick what to expand first.\n\nWhich area do you want to start with?";
  return {
    role: "assistant",
    text,
    cards: [],
    quickReplies: makeQuickReplies([
      ...topicQuickReplies(lang),
      ...baseNavQuickReplies(lang, { includeRestart: false, includeEscalate: false })
    ])
  };
}

export function handleUserText(state, userText) {
  const lang = state.lang;
  const raw = (userText || "").trim();
  const zh = lang === "zh";

  if (state.ended) {
    const revived = initDialogState(lang);
    return { state: revived, message: getInitialAssistantMessage(lang) };
  }

  if (!raw) {
    const text = zh ? "你可以点一个主题开始。" : "Please tap a topic to start.";
    return {
      state,
      message: {
        role: "assistant",
        text,
        cards: [],
        quickReplies: makeQuickReplies([...topicQuickReplies(lang), ...baseNavQuickReplies(lang)])
      }
    };
  }

  if (containsAny(raw, PII_TRIGGERS)) return { state, message: piiWarningMessage(lang) };

  if (containsAny(raw, PROFANITY_TRIGGERS) || isLowInformationInput(raw)) {
    return { state, message: invalidInputMessage(lang) };
  }

  if (containsAny(raw, SENSITIVE_TRIGGERS)) {
    const next = withHistoryPush({
      ...state,
      step: "choose_domain",
      domainId: null,
      secondaryDomainId: null,
      lastQuery: "",
      offset: 0,
      candidateDomains: [],
      confirmedDomains: []
    }, state);
    return { state: next, message: sensitiveMessage(lang) };
  }

  if (containsAny(raw, URGENT_TRIGGERS)) {
    const next = withHistoryPush({
      ...state,
      step: "choose_domain",
      domainId: null,
      secondaryDomainId: null,
      lastQuery: "",
      offset: 0,
      candidateDomains: [],
      confirmedDomains: []
    }, state);
    return { state: next, message: urgentMessage(lang) };
  }

  const direct = detectDirectScenario(raw, lang);
  if (direct) {
    const next = withHistoryPush({
      ...state,
      step: "refine_and_show",
      domainId: direct.domainId,
      secondaryDomainId: direct.secondaryDomainId || null,
      lastQuery: direct.scenarioQuery,
      offset: 0,
      ended: false,
      candidateDomains: [],
      confirmedDomains: []
    }, state);

    return {
      state: next,
      message: buildResultsMessage({
        lang,
        domainId: next.domainId,
        secondaryDomainId: next.secondaryDomainId,
        query: next.lastQuery,
        offset: 0,
        pageSize: next.pageSize
      })
    };
  }

  const lite = analyzeUserIssue(raw, zh ? "zh" : "en");
  const liteDomainId = mapLiteDomainToDomainId(lite?.domain);

  const scores = detectDomainScores(raw);
  if (liteDomainId && (lite?.confidence ?? 0) >= 0.45) {
    scores[liteDomainId] = (scores[liteDomainId] || 0) + 2;
  }

  if (isClearlyIrrelevantInput(raw, scores)) {
    return { state, message: invalidInputMessage(lang) };
  }

  let allDomains = pickAllDomains(scores, 2);

  const normalized = normalizeText(raw).toLowerCase();
  const financialOverride =
    /\b(daily expenses?|living expenses?|basic expenses?|monthly expenses?|cover my expenses?|pay my bills?|cost of living|financial stress|money problems?)\b/i.test(normalized) ||
    /(生活费|日常开销|基本开销|每月开销|钱不够|经济压力|付不起.*开销|付不起.*生活费|生活成本)/.test(raw);

  if (financialOverride) {
    allDomains = ["financial", ...allDomains.filter(d => d !== "financial")];
  }

  const primary = allDomains[0] || pickPrimaryDomain(scores) || softGuessDomainId(raw) || null;
  const secondary = primary ? pickSecondaryDomain(scores, primary) : null;

  if (!primary && state.step === "choose_domain") {
    return { state, message: outOfScopeMessage(lang) };
  }

  if (allDomains && allDomains.length >= 2) {
    const next = withHistoryPush({
      ...state,
      step: "confirm_domains",
      domainId: null,
      secondaryDomainId: null,
      lastQuery: raw,
      offset: 0,
      candidateDomains: allDomains.slice(0, 8),
      confirmedDomains: []
    }, state);

    return { state: next, message: messageForState(next) };
  }

  if (state.step === "choose_domain") {
    const next = withHistoryPush({
      ...state,
      step: "choose_focus",
      domainId: primary,
      secondaryDomainId: secondary,
      lastQuery: raw,
      offset: 0,
      candidateDomains: [],
      confirmedDomains: []
    }, state);

    return { state: next, message: messageForState(next) };
  }

  if (state.step === "choose_focus") {
    const next = withHistoryPush({
      ...state,
      step: "refine_and_show",
      lastQuery: raw,
      offset: 0,
      candidateDomains: [],
      confirmedDomains: []
    }, state);

    return {
      state: next,
      message: buildResultsMessage({
        lang,
        domainId: next.domainId,
        secondaryDomainId: next.secondaryDomainId,
        query: next.lastQuery,
        offset: 0,
        pageSize: next.pageSize
      })
    };
  }

  const next = withHistoryPush({
    ...state,
    step: "refine_and_show",
    lastQuery: raw,
    offset: 0
  }, state);

  return {
    state: next,
    message: buildResultsMessage({
      lang,
      domainId: next.domainId,
      secondaryDomainId: next.secondaryDomainId,
      query: next.lastQuery,
      offset: 0,
      pageSize: next.pageSize
    })
  };
}

export function handleAction(state, action) {
  const lang = state.lang;
  const zh = lang === "zh";

  if (!action || !action.type) return { state, message: null };

  switch (action.type) {
    case "RESTART": {
      const s = initDialogState(lang);
      return { state: s, message: getInitialAssistantMessage(lang) };
    }

    case "BACK": {
      const { restored, history } = restoreFromHistory(state);
      if (!restored) {
        const s = initDialogState(lang);
        return { state: s, message: getInitialAssistantMessage(lang) };
      }
      const s = { ...state, ...restored, lang, history, ended: false };
      return { state: s, message: messageForState(s) };
    }

    case "TOGGLE_CONFIRMED_DOMAIN": {
      if (state.step !== "confirm_domains") return { state, message: null };

      const current = Array.isArray(state.confirmedDomains) ? [...state.confirmedDomains] : [];
      const id = action.domainId;
      const exists = current.includes(id);

      let nextConfirmed;
      if (exists) {
        nextConfirmed = current.filter(x => x !== id);
      } else {
        nextConfirmed = current.length >= MAX_CONFIRMED_DOMAINS
          ? [...current.slice(0, MAX_CONFIRMED_DOMAINS - 1), id]
          : [...current, id];
      }

      const next = {
        ...state,
        confirmedDomains: nextConfirmed
      };

      return { state: next, message: messageForState(next) };
    }

    case "SEARCH_CONFIRMED_DOMAINS": {
      if (state.step !== "confirm_domains") return { state, message: null };

      const confirmed = Array.isArray(state.confirmedDomains) ? state.confirmedDomains : [];
      if (!confirmed.length) return { state, message: messageForState(state) };

      const next = withHistoryPush({
        ...state,
        step: "refine_and_show",
        domainId: confirmed[0],
        secondaryDomainId: confirmed[1] || null,
        offset: 0,
        ended: false
      }, state);

      return {
        state: next,
        message: buildResultsMessage({
          lang,
          domainId: next.domainId,
          secondaryDomainId: next.secondaryDomainId,
          query: next.lastQuery,
          offset: 0,
          pageSize: next.pageSize
        })
      };
    }

    case "SET_DOMAIN": {
      const hasExistingQuery = !!(state.lastQuery && state.lastQuery.trim());

      if (state.step === "choose_domain" && hasExistingQuery) {
        const next = withHistoryPush({
          ...state,
          step: "refine_and_show",
          domainId: action.domainId,
          secondaryDomainId: null,
          offset: 0,
          ended: false
        }, state);

        return {
          state: next,
          message: buildResultsMessage({
            lang,
            domainId: next.domainId,
            secondaryDomainId: next.secondaryDomainId,
            query: next.lastQuery,
            offset: 0,
            pageSize: next.pageSize
          })
        };
      }

      const next = withHistoryPush({
        ...state,
        step: "choose_focus",
        domainId: action.domainId,
        secondaryDomainId: null,
        lastQuery: "",
        offset: 0,
        ended: false,
        candidateDomains: [],
        confirmedDomains: []
      }, state);

      return { state: next, message: messageForState(next) };
    }

    case "SET_QUERY": {
      const text = (action.text || "").trim();
      if (!text) return { state, message: null };

      const next = withHistoryPush({
        ...state,
        step: "refine_and_show",
        lastQuery: text,
        offset: 0,
        ended: false,
        candidateDomains: [],
        confirmedDomains: []
      }, state);

      return {
        state: next,
        message: buildResultsMessage({
          lang,
          domainId: next.domainId,
          secondaryDomainId: next.secondaryDomainId,
          query: next.lastQuery,
          offset: next.offset,
          pageSize: next.pageSize
        })
      };
    }

    case "MORE": {
      if (state.step !== "refine_and_show") return { state, message: null };

      const next = withHistoryPush(
        { ...state, offset: (state.offset || 0) + (state.pageSize || DEFAULT_PAGE_SIZE) },
        state
      );

      return {
        state: next,
        message: buildResultsMessage({
          lang,
          domainId: next.domainId,
          secondaryDomainId: next.secondaryDomainId,
          query: next.lastQuery,
          offset: next.offset,
          pageSize: next.pageSize
        })
      };
    }

    case "NO_MORE": {
      const msg = zh
        ? "没有更多匹配结果了。你可以返回并换一个场景，或者换一个主题。"
        : "No more matched results. You can go back and try another scenario, or switch topic.";

      return {
        state,
        message: {
          role: "assistant",
          text: msg,
          cards: [],
          quickReplies: baseNavQuickReplies(lang)
        }
      };
    }

    default:
      return { state, message: null };
  }
}