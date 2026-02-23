// src/utils/nlpLite.js

//helpers
function normalize(s) {
    return (s || "")
        .toLowerCase()
        .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/\s+/g, " ")
        .trim();
}

function hasCJK(s) {
    return /[\u4e00-\u9fff]/.test(s || "");
}


function tokenize(text, lang) {
    const s = normalize(text);
    const parts = s.split(/[ ,，。！？；:()\[\]{}"'“”‘’/\\\n\t]+/).filter(Boolean);
    if (lang === "en") return parts;

    // zh: keep 1~6 length chunks + also keep full chunks
    const tokens = new Set();
    for (const p of parts) {
        if (!p) continue;
        tokens.add(p);
        // add small ngrams for robust matching 
        const maxLen = Math.min(p.length, 6);
        for (let L = 2; L <= maxLen; L++) {
            for (let i = 0; i + L <= p.length; i++) {
                tokens.add(p.slice(i, i + L));
            }
        }
    }
    return Array.from(tokens);
}

//synonym/related expansion
const SYN = {
    zh: {
        // financial
        "经济援助": ["生活补助", "现金援助", "补贴", "津贴", "救助", "comcare", "困难", "没钱", "开销", "欠费"],
        "生活补助": ["经济援助", "现金援助", "补贴", "津贴", "comcare"],
        "医疗": ["看病", "诊疗", "医院", "门诊", "药费", "护理", "照护", "健康"],
        "住房": ["租房", "房租", "住屋", "住宿", "短期住宿", "无家可归", "居住"],
        "失业": ["没工作", "裁员", "找工作", "无收入"],
        // focus/intents
        "资格": ["条件", "符合", "能不能申请", "eligible", "qualify"],
        "流程": ["步骤", "怎么申请", "如何申请", "材料", "文件", "证明", "表格"]
    },
    en: {
        "financial": ["financial help", "financial aid", "cash assistance", "living assistance", "cost of living", "bills", "comcare"],
        "housing": ["rent", "rental", "housing help", "accommodation", "shelter", "homeless", "hdb"],
        "medical": ["healthcare", "medical", "clinic", "hospital", "medication", "care", "nursing"],
        "unemployed": ["jobless", "laid off", "lost my job", "no income"],
        // intents
        "eligibility": ["eligible", "eligibility", "qualify", "criteria", "requirements"],
        "steps": ["how to apply", "steps", "process", "documents", "what to prepare", "paperwork"]
    }
};

// domain hints: (keywords -> domain)
const DOMAIN_HINTS = {
    financial: {
        zh: ["钱", "经济", "补助", "援助", "生活费", "账单", "欠费", "低收入", "现金", "津贴", "补贴", "comcare"],
        en: ["financial", "cash", "money", "bills", "assistance", "aid", "income", "comcare", "cost"]
    },
    housing: {
        zh: ["房", "住房", "租", "房租", "住宿", "住哪", "无家可归", "hdb"],
        en: ["housing", "rent", "rental", "accommodation", "shelter", "homeless", "hdb"]
    },
    healthcare: {
        zh: ["医疗", "看病", "医院", "诊所", "药", "药费", "护理", "照护", "健康"],
        en: ["medical", "healthcare", "clinic", "hospital", "medicine", "medication", "care", "nursing"]
    }
};

// intent patterns
const INTENT_PATTERNS = [
    { id: "eligibility", zh: ["资格", "条件", "符合", "能不能申请", "能申请吗"], en: ["eligible", "eligibility", "qualify", "criteria", "requirements"] },
    { id: "steps",       zh: ["怎么申请", "如何申请", "流程", "步骤", "材料", "文件", "证明"], en: ["how to apply", "steps", "process", "documents", "paperwork"] },
    { id: "overview",    zh: ["是什么", "有哪些", "推荐", "介绍", "想了解"], en: ["what is", "options", "recommend", "overview", "tell me about"] }
];

// scoring
function countMatches(hayTokens, needles) {
    let c = 0;
    for (const n of needles) if (hayTokens.has(n)) c++;
    return c;
}

function expand(tokens, lang) {
    const dict = SYN[lang] || {};
    const expanded = new Set(tokens);

    // direct expansions by substring match
    for (const t of tokens) {
        for (const [k, arr] of Object.entries(dict)) {
            if (!k) continue;
            if (t === k || t.includes(k) || k.includes(t)) {
                expanded.add(k);
                for (const a of arr) expanded.add(normalize(a));
            }
        }
    }
    return Array.from(expanded);
}

function inferIntent(text, lang) {
    const s = normalize(text);
    for (const p of INTENT_PATTERNS) {
        const arr = lang === "zh" ? p.zh : p.en;
        if (arr.some((x) => s.includes(normalize(x)))) return p.id;
    }
    return "overview";
}

function inferDomain(expandedTokens, lang) {
    const tokenSet = new Set(expandedTokens);
    let best = { id: "unknown", score: 0 };

    for (const [dom, hints] of Object.entries(DOMAIN_HINTS)) {
        const arr = lang === "zh" ? hints.zh : hints.en;
        const s = countMatches(tokenSet, arr.map(normalize));
        if (s > best.score) best = { id: dom, score: s };
    }
    return best;
}

export function analyzeUserIssue(text, preferredAgentLang /* "zh"|"en" */) {
    const raw = text || "";
    const lang = preferredAgentLang === "en" ? "en" : "zh"; // use the agent language as analysis lens

    // tokenize + expand
    const tokens = tokenize(raw, lang);
    const expanded = expand(tokens, lang);

    const intent = inferIntent(raw, lang);
    const domainBest = inferDomain(expanded, lang);

    // confidence: simple heuristic
    const confidence = Math.max(
        0.15,
        Math.min(0.95, (domainBest.score * 0.18) + (intent !== "overview" ? 0.2 : 0.08))
    );

    // main keywords (dedupe, keep short list)
    const keywords = Array.from(new Set(expanded))
        .filter((x) => x && x.length >= (lang === "zh" ? 2 : 3))
        .slice(0, 12);

    // structured summary for routing/logging (not shown to user)
    const summary =
        lang === "zh"
            ? `领域=${domainBest.id}；意图=${intent}；关键词=${keywords.join("、")}`
            : `domain=${domainBest.id}; intent=${intent}; keywords=${keywords.join(", ")}`;

    return {
        analysis_lang: lang,
        input_has_cjk: hasCJK(raw),
        domain: domainBest.id,
        domain_score: domainBest.score,
        intent,
        confidence,
        keywords,
        summary
    };
}
