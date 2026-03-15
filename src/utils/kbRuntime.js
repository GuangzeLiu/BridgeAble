import bundledKb from "../data/sg_services_kb_updated.json";

let runtimeKb = normalizeKb(bundledKb);

function normalizeKb(kb) {
    if (!kb || typeof kb !== "object") {
        return bundledKb;
    }

    return {
        ...kb,
        updated: kb.updated || "",
    };
}

export function getRuntimeKb() {
    return runtimeKb;
}

export async function loadRuntimeKb() {
    try {
        const res = await fetch(`/generated_kb.json?ts=${Date.now()}`, {
            cache: "no-store",
        });

        if (!res.ok) {
            throw new Error("No generated KB found");
        }

        const data = await res.json();
        runtimeKb = normalizeKb(data);
        return runtimeKb;
    } catch (err) {
        runtimeKb = normalizeKb(bundledKb);
        return runtimeKb;
    }
}

export function setRuntimeKb(kb) {
    runtimeKb = normalizeKb(kb);
}