# BridgeAble: Improving Access to Social Support with AI

BridgeAble is a lightweight **AI-powered conversational assistant prototype** designed to help vulnerable populations in Singapore, especially **older adults** and **low-income families**, find and understand social-support schemes more easily. The project focuses on a common access problem: relevant information about financial assistance, healthcare subsidies, and social services is often spread across many official websites, written in policy-heavy language, and difficult to navigate for users with limited digital literacy. fileciteturn6file1

Instead of requiring users to know official programme names in advance, BridgeAble allows them to start with simple everyday inputs such as **"financial aid"**, **"housing grant"**, **"money"**, **"rent"**, **"caregiver"**, or **"medical help"**. The system then interprets the user’s likely intent, asks guided follow-up questions, and returns plain-language, bilingual summaries of relevant schemes together with links to official resources, application portals, or service entry points. The system is explicitly designed as a **support and guidance tool**, not as an eligibility decision-maker. For complex, sensitive, or uncertain situations, it directs users to **human support pathways** rather than making unsupported judgments. 

---

## Project Overview

The project is situated in the **Social Good** area. Its main goal is to reduce the access barriers that vulnerable groups face when trying to understand available support and how to begin the application process. In particular, BridgeAble aims to:

- enable **need-based discovery** of support without requiring official scheme names;
- improve **comprehension** by translating policy-heavy content into short, plain-language explanations;
- promote **digital inclusion** through a guided conversational interface that feels less intimidating than navigating multiple agency websites; and
- demonstrate **responsible AI practice** by grounding responses in trusted sources, communicating uncertainty clearly, and keeping a human escalation path available. fileciteturn6file1

---

## Proposed AI Approach

BridgeAble follows a **guided, retrieval-grounded design** rather than a fully open-ended chatbot. This design choice helps reduce the risk of hallucinated or misleading policy information.

### 1. Lightweight NLP intent recognition
The system first uses lightweight NLP methods to interpret short, ambiguous, everyday user inputs. This allows users to describe needs naturally without having to know exact programme names or policy terminology. fileciteturn6file1

### 2. Grounded retrieval from a curated knowledge base
Once the user’s likely need is identified, the system retrieves relevant content from a **curated local knowledge base** built from trusted policy sources, official scheme pages, and verified contact information. This keeps the assistant grounded in reliable material rather than generating answers freely. fileciteturn6file1turn6file0

### 3. Controlled plain-language response construction
On top of the retrieved content, BridgeAble reformulates policy-heavy information into short, structured explanations that focus on practical questions users care about most:

- who the scheme is for,
- what support it provides, and
- what steps are needed to apply. fileciteturn6file1

### 4. Bilingual support
To improve accessibility, the prototype supports responses in **English and Chinese**, allowing users with different language preferences to access the same grounded information more comfortably. fileciteturn6file1turn6file0

### 5. Human-agent escalation
When a case is sensitive, urgent, or beyond system confidence, the assistant avoids making decisions and instead recommends official channels or connection with a human caseworker. This is a core safety feature of the prototype. fileciteturn6file1turn6file0

---

## System Design

This repository contains a **frontend prototype** implemented with **React.js and Vite**. The prototype is intentionally lightweight and locally grounded. Its main design elements are:

- a **deterministic dialog engine / state-machine style flow**, which makes the conversation auditable and reduces free-form generation risks;
- a **local JSON knowledge base**, used as the main source of truth for scheme summaries, official links, and contact entry points;
- a **guided conversational flow** that narrows from broad topic to clearer need and then to relevant scheme results; and
- a **human support layer** for escalation when the situation requires more personalised or sensitive assistance. fileciteturn6file0turn6file1

The prototype is therefore not positioned as a replacement for public officers, social workers, or case managers. Its intended role is to make first-step navigation easier and safer. fileciteturn6file1turn6file0

---

## Current Features

- keyword-based entry without requiring official programme names;
- guided clarification through follow-up prompts and quick replies;
- plain-language summaries of support schemes;
- bilingual output in **English / Chinese**;
- references to official portals, agencies, and hotlines; and
- escalation to a human support pathway for complex or sensitive cases. fileciteturn6file0turn6file1

---

## Why This Project Matters

BridgeAble is motivated by a practical digital-inclusion problem. Even when support schemes exist, they can remain difficult to access in practice because users may not know where to start, may not understand formal policy language, or may feel overwhelmed by fragmented official systems. The project therefore focuses on **accessibility, clarity, and safe guidance**, especially for people who may be less confident using digital systems. fileciteturn6file1

By combining intent recognition, grounded retrieval, controlled explanation, bilingual support, and human escalation, the prototype aims to improve access to social support while keeping the role of AI appropriately limited and accountable. fileciteturn6file1

---

## Limitations

BridgeAble is still a prototype and has several important limitations:

- it does **not** determine eligibility or make personalised case decisions;
- a local knowledge base can become outdated if it is not refreshed regularly;
- some elderly or vulnerable users may still face device, literacy, or accessibility barriers; and
- sensitive cases may require discretion and contextual judgment beyond what a guided assistant should provide. fileciteturn6file0turn6file1

For these reasons, users should always verify critical details using the attached official links or seek help from the recommended human support channels. fileciteturn6file0turn6file1

---

## Repository Purpose

This repository is intended to demonstrate the **concept, interaction flow, and responsible AI design choices** behind BridgeAble. It is best understood as a prototype for guided social-support discovery rather than a production eligibility system. fileciteturn6file1turn6file0

---

## Access

Visit the prototype here:

**[Social Good Chatbot](https://guangzeliu.github.io/social-good-assistant/)**

---

## KB Last Updated

**2026-02-10**
