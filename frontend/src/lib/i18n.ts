import { ref } from "vue";
import zh from "../locales/zh.json";
import en from "../locales/en.json";
import * as StoreService from "@bindings/hitool/services/storeservice";
import { inWails } from "./backend";

type Dict = Record<string, unknown>;

const dicts: Record<string, Dict> = { zh, en };

export const lang = ref<"zh" | "en">("zh");

function lookup(dict: Dict, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Dict)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Translate a dotted key; {n}-style params interpolate. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = lookup(dicts[lang.value], key) ?? lookup(dicts.zh, key) ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export async function setLang(l: "zh" | "en") {
  lang.value = l;
  document.documentElement.lang = l;
  try {
    if (inWails()) {
      await StoreService.SetSetting("lang", l);
    } else {
      localStorage.setItem("lang", l);
    }
  } catch {
    /* persistence is best-effort */
  }
}

export async function initLang() {
  let saved = "";
  try {
    saved = inWails()
      ? await StoreService.GetSetting("lang")
      : localStorage.getItem("lang") || "";
  } catch {
    /* fall through to default */
  }
  if (saved === "zh" || saved === "en") {
    lang.value = saved;
  } else {
    lang.value = navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
  }
  document.documentElement.lang = lang.value;
}
