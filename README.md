# Social Good Assistant (Prototype)

A lightweight, **AI-inspired conversational assistant** for Singapore social support discovery.  
Users can type simple keywords (e.g., “financial aid”, “housing grant”), and the assistant guides them with follow-up questions, returns **plain-language** and **multilingual** (EN/中文) scheme summaries, and redirects them to **verified agencies / portals / hotlines**.  
This prototype is designed as a **guidance tool** (not an eligibility decision-maker) and supports **human escalation** for complex or sensitive cases.

> **Area:** Social Good  
> **Target users:** vulnerable populations such as elderly individuals and low-income families

---

## Problem

Vulnerable populations often struggle to access timely and accurate information about social services, healthcare, or financial assistance because:

- Information is **fragmented across multiple websites and agencies**
- Official descriptions are written in **complex administrative language**
- Some users have **low digital literacy**, making navigation and eligibility checks difficult

---

## Proposed AI Solution (What this project builds)

An AI-powered conversational chatbot that:

1. Accepts **simple keywords** without requiring users to know official program names
2. Uses **guided follow-up questions** to clarify intent (needs, situation, next steps)
3. Provides **plain-language**, step-by-step explanations of relevant schemes
4. Supports **multilingual responses** (English / 中文) to reduce language barriers
5. Redirects users to **official portals and verified resources**
6. **Escalates** complex / sensitive cases to human caseworkers (rather than “auto-handling”)

---

## What AI contributes (mapped to system behaviors)

- **Intent recognition from minimal input**  
  Users can start with vague terms (“help”, “money”, “rent”, “caregiver”) and the assistant narrows the topic through structured prompts.

- **Plain-language rephrasing**  
  Policy-style eligibility and procedures are summarized into user-friendly steps and checklists.

- **Multilingual support**  
  Key scheme fields and guidance are returned in EN/中文.

- **Guided navigation without automated decisions**  
  The assistant asks clarifying questions and offers “next step” guidance, but avoids declaring “you are eligible / not eligible”.

- **Smart redirection**  
  Outputs include references to official agencies and trusted entry points (e.g., hotlines, help centres, official portals).

---

## System overview (Prototype architecture)

This repo is a **front-end prototype** built with **![React](https://img.shields.io/badge/React-20232A?logo=React&logoColor=61DAFB&style=for-the-badge) + ![Vite](https://img.shields.io/badge/Vite-646CFF?logo=Vite&logoColor=white&style=for-the-badge)**.

Core characteristics:

- **Deterministic dialog engine (state machine)**: the conversation follows a controlled flow (topic → focus → refine → results), which reduces hallucination risk and makes behavior auditable.
- **Local knowledge base (JSON)**: curated scheme entries and official contacts are stored locally and queried by the dialog engine.
- **No automatic policy “decisions”**: the assistant provides guidance and redirection rather than eligibility verdicts.
- **Safety-first routing**: sensitive / urgent queries are redirected to human help resources.

> In earlier iterations, the dialog engine is implemented as a small state machine (e.g., `src/utils/dialogEngine.js`) and reads a local KB JSON (e.g., `src/data/sg_services_kb.json`). The intent is to keep the prototype **frontend-only** and avoid network calls until verified data and governance are in place.

---

## Key features (current)

- ✅ Keyword-based entry (users don’t need official scheme names)
- ✅ Guided clarification via follow-up questions / quick replies
- ✅ Plain-language summaries & step-by-step guidance
- ✅ Multilingual outputs (EN/中文)
- ✅ Human escalation for urgent/sensitive scenarios (hotlines / service offices)

---

## Limitations & considerations

- **Digital access barrier**  
  Some elderly users may still struggle with devices or text input → future work: voice input, larger UI elements, simplified flows.

- **Outdated information risk**  
  Policies change. A static KB can become stale → future work: update pipeline + human review + “last updated” surfacing.

- **Over-reliance risk**  
  Users might treat the chatbot as authoritative → mitigate with clear disclaimers and “verify via official channels”.

- **Privacy & data protection**  
  Users may share sensitive personal info → mitigate by minimizing data collection and encouraging offline/human channels for sensitive details.

- **Contextual complexity**  
  Real cases can require discretion → keep escalation paths prominent; avoid automated decisions.

---

## Why this is effective

- Reduces language/comprehension barriers → **improves service access**
- Addresses information inequality caused by fragmented systems and low digital literacy
- Scales basic guidance while preserving **human oversight** and ethical accountability

---

### Visit "[Social Good Chatbot](https://guangzeliu.github.io/social-good-assistant/)" to access
