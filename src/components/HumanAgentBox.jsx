import React, { useEffect, useState } from "react";
import { analyzeUserIssue } from "../utils/nlpLite";

const QUICK_FILL = {
    zh: {
        primary: [
            { key: "money", label: "经济援助", text: "经济援助" },
            { key: "home", label: "住房帮助", text: "住房帮助" },
            { key: "health", label: "医疗照护", text: "医疗照护" },
            { key: "mental", label: "心理支持", text: "心理支持" },
            { key: "legal", label: "法律援助", text: "法律援助" },
            { key: "seniors", label: "长者相关", text: "长者相关" },
            { key: "more", label: "更多", action: "TOGGLE_MORE" }
        ],
        more: [
            { key: "disability", label: "残障支持", text: "残障支持" },
            { key: "steps", label: "申请流程", text: "我想问申请流程" },
            { key: "eligibility", label: "资格条件", text: "我想确认资格条件" },
            { key: "urgent", label: "紧急", text: "紧急" }
        ]
    },
    en: {
        primary: [
            { key: "money", label: "Money", text: "Financial help" },
            { key: "home", label: "Home", text: "Housing help" },
            { key: "health", label: "Health", text: "Healthcare / care" },
            { key: "mental", label: "Mental", text: "Mental health support" },
            { key: "legal", label: "Legal", text: "Legal help" },
            { key: "seniors", label: "Seniors", text: "Seniors / caregiver support" },
            { key: "more", label: "More", action: "TOGGLE_MORE" }
        ],
        more: [
            { key: "disability", label: "Disability", text: "Disability support" },
            { key: "steps", label: "Steps", text: "Application steps" },
            { key: "eligibility", label: "Eligibility", text: "Eligibility criteria" },
            { key: "urgent", label: "Urgent", text: "Urgent" }
        ]
    }
};

function looksChinese(s) {
    return /[\u4e00-\u9fff]/.test(s || "");
}

function mapKnownZhToEn(text) {
    const t = (text || "").trim();
    return t
        .replaceAll("经济援助", "Financial help")
        .replaceAll("住房帮助", "Housing help")
        .replaceAll("医疗照护", "Healthcare / care")
        .replaceAll("我想问申请流程", "I want to ask about application steps")
        .replaceAll("我想确认资格条件", "I want to check eligibility criteria");
}

const UI = {
    title: { zh: "人工客服", en: "Human Agent" },
    stepIntake: { zh: "步骤 1/2：请先描述问题", en: "Step 1/2: Describe issue first" },
    statusConnecting: { zh: "状态：连接中…", en: "Status: Connecting…" },

    agentLangLabel: { zh: "希望人工客服使用的语言", en: "Preferred agent language" },
    agentLangHint: { zh: "用于匹配合适的接线员（模拟）", en: "Used to match the right agent (simulated)" },
    agentLangZhBtn: { zh: "中文", en: "Chinese" },
    agentLangEnBtn: { zh: "English", en: "English" },

    descLabel: { zh: "请先描述问题（必填）", en: "Describe your issue (required)" },
    descPh: {
        zh: "例如：我想申请生活补助，但不确定是否符合条件…",
        en: "e.g., I want to apply for financial help but I'm not sure if I'm eligible…"
    },

    quickHint: { zh: "不方便打字？点下面按钮快速补全：", en: "Hard to type? Tap to fill quickly:" },
    chipFinance: { zh: "经济援助", en: "Financial help" },
    chipHousing: { zh: "住房帮助", en: "Housing help" },
    chipCare: { zh: "医疗照护", en: "Healthcare/care" },
    chipProcess: { zh: "申请流程", en: "Application steps" },
    chipEligibility: { zh: "资格条件", en: "Eligibility" },

    privacyQ: { zh: "是否涉及私密信息？", en: "Does it involve private/sensitive info?" },
    privacyNo: { zh: "不涉及", en: "No" },
    privacyMaybe: { zh: "可能涉及", en: "Maybe" },

    urgentQ: { zh: "是否紧急？", en: "Is it urgent?" },
    urgentNo: { zh: "不紧急", en: "Not urgent" },
    urgentYes: { zh: "紧急", en: "Urgent" },

    connectBtn: { zh: "连接人工", en: "Connect" },

    note: {
        zh: "提醒：请不要在这里输入身份证号、银行卡号等敏感信息。",
        en: "Note: Please do not enter ID numbers, bank card details, or other sensitive info here."
    },

    errDesc: { zh: "请先简单描述一下问题（写几个词也可以）。", en: "Please describe your issue first (a few words are fine)." },
    errPick: { zh: "请先选择：是否私密、是否紧急、客服语言。", en: "Please choose: private info? urgent? agent language." },

    connectingSystem: { zh: "正在连接人工客服…（模拟）", en: "Connecting to a human agent… (simulated)" },
    queuedPh: { zh: "输入消息…（连接中会先暂存）", en: "Type a message… (queued while connecting)" },
    sendBtn: { zh: "发送", en: "Send" },

    voiceBtn: { zh: "申请语音连线", en: "Request voice call" },
    voiceBtnDone: { zh: "语音申请已提交", en: "Voice requested" },
    voiceQueued: { zh: "状态：语音排队中（模拟）", en: "Status: voice queued (simulated)" },
    voiceSystem: { zh: "已提交语音连线申请：请保持页面打开，我们会尽快为您接通（模拟）。", en: "Voice call request submitted: please keep this page open. We'll connect you soon (simulated)." }
};

function txt(agentLang, key) {
    const zh = UI[key]?.zh ?? "";
    const en = UI[key]?.en ?? "";
    return agentLang === "zh" ? zh : en;
}

export default function HumanAgentBox({ open, onClose }) {
    const [step, setStep] = useState("intake"); // intake | connecting
    const [agentLang, setAgentLang] = useState("en"); // "zh" | "en"

    const [desc, setDesc] = useState("");
    const [isPrivate, setIsPrivate] = useState(null);
    const [isUrgent, setIsUrgent] = useState(null);
    const [error, setError] = useState("");
    const [showMore, setShowMore] = useState(false);

    const [messages, setMessages] = useState([{ role: "system", text: UI.connectingSystem.zh }]);
    const [draft, setDraft] = useState("");

    const [voiceRequested, setVoiceRequested] = useState(false);
    const [voiceStatus, setVoiceStatus] = useState(""); // "" | "requesting" | "queued" | "connected"

    useEffect(() => {
        if (open) {
            setStep("intake");
            setError("");
            setIsPrivate(null);
            setIsUrgent(null);
            setMessages([{ role: "system", text: txt(agentLang, "connectingSystem") }]);
            setDraft("");
            setVoiceRequested(false);
            setVoiceStatus("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        setMessages((prev) => {
            if (!prev || prev.length === 0) return [{ role: "system", text: txt(agentLang, "connectingSystem") }];
            const next = [...prev];
            if (next[0]?.role === "system") next[0] = { role: "system", text: txt(agentLang, "connectingSystem") };
            return next;
        });
    }, [agentLang]);

    const canProceed =
        (desc || "").trim().length >= 3 &&
        isPrivate !== null &&
        isUrgent !== null &&
        (agentLang === "zh" || agentLang === "en");

    async function connectHumanAgent(payload) {
        return { ok: true, payload };
    }
    async function sendToHumanAgent(text) {
        return { ok: true, text };
    }

    function quickFillItem(item) {
        if (item.action === "TOGGLE_MORE") {
            setShowMore(v => !v);
            return;
        }
        const text = item.text;
        setDesc(prev => {
            const p = (prev || "").trim();
            return p ? `${p}; ${text}` : text;
        });
    }

    async function onSubmitIntake() {
        setError("");
        const d = (desc || "").trim();

        if (d.length < 3) {
            setError(txt(agentLang, "errDesc"));
            return;
        }
        if (isPrivate === null || isUrgent === null || !(agentLang === "zh" || agentLang === "en")) {
            setError(txt(agentLang, "errPick"));
            return;
        }

        const nlp = analyzeUserIssue(d, agentLang);

        const intake = {
            description: d,
            private: isPrivate,
            urgent: isUrgent,
            preferred_agent_language: agentLang,
            nlp
        };

        const summary =
            agentLang === "zh"
                ? `转接摘要：\n- 问题：${intake.description}\n- 私密信息：${intake.private ? "可能涉及" : "不涉及"}\n- 紧急：${intake.urgent ? "紧急" : "不紧急"}\n- 客服语言：${agentLang === "zh" ? "中文" : "英文"}`
                : `Intake summary:\n- Problem: ${intake.description}\n- Private info: ${intake.private ? "Maybe" : "No"}\n- Urgent: ${intake.urgent ? "Urgent" : "Not urgent"}\n- Agent language: ${agentLang === "zh" ? "Chinese" : "English"}`;

        setMessages([
            { role: "system", text: txt(agentLang, "connectingSystem") },
            { role: "user", text: summary }
        ]);

        await connectHumanAgent(intake);
        setStep("connecting");
    }

    async function handleSend() {
        const t = (draft || "").trim();
        if (!t) return;
        setMessages((prev) => [...prev, { role: "user", text: t }]);
        setDraft("");
        await sendToHumanAgent(t);
    }

    async function requestVoiceCall() {
        if (voiceRequested) return;
        setVoiceRequested(true);
        setVoiceStatus("requesting");

        // Simulated request (swap to real API later)
        await new Promise((r) => setTimeout(r, 500));
        setVoiceStatus("queued");

        setMessages((prev) => [...prev, { role: "system", text: txt(agentLang, "voiceSystem") }]);
    }

    if (!open) return null;

    return (
        <div className="humanPanel">
            <div className="humanPanelHeader">
                <div>
                    <div className="humanTitle">{txt(agentLang, "title")}</div>
                    <div className="humanSub">
                        {step === "intake" ? txt(agentLang, "stepIntake") : txt(agentLang, "statusConnecting")}
                    </div>
                </div>
                <button className="humanClose" type="button" onClick={onClose}>
                    ✕
                </button>
            </div>

            {step === "intake" ? (
                <div className="humanBody">
                    <div className="humanLabel">{txt(agentLang, "agentLangLabel")}</div>
                    <div className="humanHint" style={{ marginTop: -4 }}>
                        {txt(agentLang, "agentLangHint")}
                    </div>
                    <div className="humanActions">
                        <button
                            className={`humanBtn ${agentLang === "zh" ? "active" : ""}`}
                            type="button"
                            onClick={() => setAgentLang("zh")}
                        >
                            {UI.agentLangZhBtn.zh}
                        </button>
                        <button
                            className={`humanBtn ${agentLang === "en" ? "active" : ""}`}
                            type="button"
                            onClick={() => setAgentLang("en")}
                        >
                            {UI.agentLangEnBtn.en}
                        </button>
                    </div>

                    <div className="humanLabel" style={{ marginTop: 12 }}>
                        {txt(agentLang, "descLabel")}
                    </div>
                    <textarea
                        className="humanTextarea"
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        placeholder={txt(agentLang, "descPh")}
                    />

                    <div className="humanQuickFill">
                        <div className="humanHint">{txt(agentLang, "quickHint")}</div>
                        <div className="humanChipRow">
                            {(agentLang === "zh" ? QUICK_FILL.zh.primary : QUICK_FILL.en.primary).map(item => (
                                <button
                                    key={item.key}
                                    className="chip"
                                    type="button"
                                    onClick={() => quickFillItem(item)}
                                    aria-pressed={item.key === "more" ? showMore : "false"}
                                >
                                    {item.label}
                                </button>
                            ))}

                            {showMore &&
                                (agentLang === "zh" ? QUICK_FILL.zh.more : QUICK_FILL.en.more).map(item => (
                                    <button
                                        key={item.key}
                                        className="chip"
                                        type="button"
                                        onClick={() => quickFillItem(item)}
                                    >
                                        {item.label}
                                    </button>
                                ))
                            }
                        </div>
                    </div>

                    <div className="humanLabel" style={{marginTop: 12}}>
                        {txt(agentLang, "privacyQ")}
                    </div>
                    <div className="humanActions">
                        <button
                            className={`humanBtn ${isPrivate === false ? "active" : ""}`}
                            type="button"
                            onClick={() => setIsPrivate(false)}
                        >
                            {txt(agentLang, "privacyNo")}
                        </button>
                        <button
                            className={`humanBtn ${isPrivate === true ? "active" : ""}`}
                            type="button"
                            onClick={() => setIsPrivate(true)}
                        >
                            {txt(agentLang, "privacyMaybe")}
                        </button>
                    </div>

                    <div className="humanLabel" style={{ marginTop: 12 }}>
                        {txt(agentLang, "urgentQ")}
                    </div>
                    <div className="humanActions">
                        <button
                            className={`humanBtn ${isUrgent === false ? "active" : ""}`}
                            type="button"
                            onClick={() => setIsUrgent(false)}
                        >
                            {txt(agentLang, "urgentNo")}
                        </button>
                        <button
                            className={`humanBtn ${isUrgent === true ? "active" : ""}`}
                            type="button"
                            onClick={() => setIsUrgent(true)}
                        >
                            {txt(agentLang, "urgentYes")}
                        </button>
                    </div>

                    {error ? <div className="humanError">{error}</div> : null}

                    <div className="humanActions" style={{ marginTop: 14 }}>
                        <button
                            className="humanBtnPrimary"
                            type="button"
                            disabled={!canProceed}
                            onClick={onSubmitIntake}
                        >
                            {txt(agentLang, "connectBtn")}
                        </button>
                    </div>

                    <div className="humanNote">{txt(agentLang, "note")}</div>
                </div>
            ) : (
                <div className="humanChat">
                    <div className="humanChatList">
                        {messages.map((m, i) => (
                            <div key={i} className={`humanMsg ${m.role}`}>
                                <div className="humanBubble">{m.text}</div>
                            </div>
                        ))}
                    </div>

                    {/* connecting step: only input + send (no Ask chatbot) */}
                    <div className="humanChatInput">
                        <input
                            className="humanInput"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder={txt(agentLang, "queuedPh")}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSend();
                            }}
                        />

                        <button className="humanBtnPrimary" type="button" onClick={handleSend}>
                            {txt(agentLang, "sendBtn")}
                        </button>
                    </div>

                    {/* connecting step: optional escalation */}
                    <div className="humanChatInput" style={{ paddingTop: 0, borderTop: "none" }}>
                        <button
                            className="humanBtn"
                            type="button"
                            onClick={requestVoiceCall}
                            disabled={voiceRequested}
                            title={agentLang === "zh" ? "提交语音连线申请（模拟）" : "Request a voice call (simulated)"}
                            style={{ width: "100%" }}
                        >
                            {voiceRequested ? txt(agentLang, "voiceBtnDone") : txt(agentLang, "voiceBtn")}
                        </button>
                    </div>

                    {voiceStatus === "queued" ? (
                        <div className="humanNote" style={{ padding: "0 14px 12px" }}>
                            {txt(agentLang, "voiceQueued")}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}