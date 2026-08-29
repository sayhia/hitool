/**
 * Shared AI session: streaming, cancel, key check, history, prompt templates.
 * Both benches (transform and chat) drive this; they only differ in layout.
 */
import { computed, onBeforeUnmount, onMounted, ref, toValue, type MaybeRefOrGetter } from "vue";
import { t, lang } from "./i18n";
import { errText } from "./err";
import { nanoId } from "./ids";
import { inWails, onAIStream } from "./backend";
import { addOutput, finishJob, startJob, type Job } from "../stores/jobs";
import { copyText } from "../stores/toast";
import {
  normalizeRecords,
  pushRecord,
  removeRecord,
  snippet,
  type AiRecord,
} from "./aiHistory";
import {
  addTemplate,
  allTemplates,
  normalizeTemplates,
  removeTemplate,
  validateTemplate,
  type PromptTemplate,
} from "./promptTemplates";
import * as AIService from "@bindings/hitool/services/aiservice";
import * as StoreService from "@bindings/hitool/services/storeservice";
import type { ChatMsg } from "./aiTasks";

const HISTORY_KEY = "ai_history";
const TEMPLATES_KEY = "ai_prompt_templates";

export function useAiEngine(toolId: MaybeRefOrGetter<string>) {
  const tid = () => toValue(toolId);

  const input = ref("");
  const output = ref("");
  const busy = ref(false);
  const hasKey = ref(true);
  const errorMsg = ref("");
  let requestId = "";
  let job: Job | undefined;
  let unsub: (() => void) | null = null;
  let runInput = "";
  let runMessages: ChatMsg[] | undefined;
  let settle: (() => void) | null = null;

  const records = ref<AiRecord[]>([]);
  const userTemplates = ref<PromptTemplate[]>([]);
  const panel = ref<"none" | "templates" | "history">("none");
  const saveName = ref("");
  const saveError = ref("");

  const templates = computed(() =>
    allTemplates(userTemplates.value, lang.value === "zh" ? "zh" : "en"),
  );

  async function readBlob(key: string): Promise<string> {
    if (inWails()) return (await StoreService.GetSetting(key)) ?? "";
    return localStorage.getItem(key) ?? "";
  }

  async function writeBlob(key: string, value: string) {
    try {
      if (inWails()) await StoreService.SetSetting(key, value);
      else localStorage.setItem(key, value);
    } catch {
      // Storage failing should never break a run.
    }
  }

  function saveHistory() {
    void writeBlob(HISTORY_KEY, JSON.stringify(records.value));
  }

  function fmtTime(ts: number): string {
    const dtf = new Intl.DateTimeFormat(lang.value === "zh" ? "zh-CN" : "en-US", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return dtf.format(new Date(ts));
  }

  function togglePanel(name: "templates" | "history") {
    panel.value = panel.value === name ? "none" : name;
    saveError.value = "";
  }

  function restoreRecord(r: AiRecord) {
    input.value = r.input;
    output.value = r.output;
    errorMsg.value = "";
    panel.value = "none";
  }

  function dropRecord(id: string) {
    records.value = removeRecord(records.value, id);
    saveHistory();
  }

  function clearHistory() {
    records.value = [];
    saveHistory();
  }

  function useTemplate(tpl: PromptTemplate) {
    input.value = tpl.body;
    panel.value = "none";
  }

  function dropTemplate(id: string) {
    userTemplates.value = removeTemplate(userTemplates.value, id);
    void writeBlob(TEMPLATES_KEY, JSON.stringify(userTemplates.value));
  }

  function saveTemplate() {
    const problem = validateTemplate(
      userTemplates.value,
      saveName.value,
      input.value,
      lang.value === "zh" ? "zh" : "en",
    );
    if (problem) {
      saveError.value = t(`ai.tpl.err.${problem}`);
      return;
    }
    userTemplates.value = addTemplate(userTemplates.value, nanoId(10), saveName.value, input.value);
    void writeBlob(TEMPLATES_KEY, JSON.stringify(userTemplates.value));
    saveName.value = "";
    saveError.value = "";
  }

  function remember(out: string) {
    if (!out.trim()) return;
    const assistant: ChatMsg = { role: "assistant", content: out };
    records.value = pushRecord(records.value, {
      id: nanoId(10),
      toolId: tid(),
      input: runInput,
      output: out,
      ts: Date.now(),
      messages: runMessages ? [...runMessages, assistant] : undefined,
    });
    saveHistory();
  }

  function finishRun(ok: boolean, err?: string) {
    if (job && job.state === "running") {
      if (ok) {
        addOutput(job, {
          path: "",
          name: t("ai.output"),
          detail: t("ai.chars", { n: output.value.length }),
          ok: true,
        });
        finishJob(job, "done");
      } else {
        finishJob(job, err === "cancelled" ? "cancelled" : "failed", err && err !== "cancelled" ? err : undefined);
      }
    }
    busy.value = false;
    const done = settle;
    settle = null;
    done?.();
  }

  onMounted(async () => {
    try {
      records.value = normalizeRecords(JSON.parse((await readBlob(HISTORY_KEY)) || "[]"));
      userTemplates.value = normalizeTemplates(JSON.parse((await readBlob(TEMPLATES_KEY)) || "[]"));
    } catch {
      records.value = [];
      userTemplates.value = [];
    }
    if (!inWails()) return;
    try {
      hasKey.value = !!(await AIService.GetConfig()).apiKey;
    } catch {
      hasKey.value = false;
    }
    unsub = onAIStream((c) => {
      if (c.id !== requestId) return;
      if (c.error) {
        errorMsg.value = c.error;
        finishRun(false, c.error);
        return;
      }
      if (c.delta) output.value += c.delta;
      if (c.done) {
        remember(output.value);
        finishRun(true);
      }
    });
  });

  onBeforeUnmount(() => {
    unsub?.();
    if (busy.value && requestId) AIService.CancelChat(requestId).catch(() => {});
  });

  async function run(messages: ChatMsg[], sourceInput: string) {
    if (busy.value) return;
    busy.value = true;
    output.value = "";
    errorMsg.value = "";
    runInput = sourceInput;
    runMessages = messages;
    requestId = `${tid()}-${Date.now()}`;
    job = startJob({ tool: tid(), label: t(`tools.${tid()}.name`), total: 1 });
    const waited = new Promise<void>((resolve) => {
      settle = resolve;
    });
    try {
      await AIService.Chat(requestId, messages as never, 0.7);
    } catch (e) {
      if (!errorMsg.value) {
        errorMsg.value = errText(e);
        finishRun(false, errorMsg.value);
      }
    }
    if (!inWails() && settle) {
      remember(output.value);
      finishRun(!errorMsg.value);
    }
    await waited;
  }

  async function stop() {
    if (requestId) await AIService.CancelChat(requestId).catch(() => {});
    finishRun(false, "cancelled");
  }

  function copy() {
    return copyText(output.value, t("common.copied"));
  }

  return {
    input,
    output,
    busy,
    hasKey,
    errorMsg,
    records,
    templates,
    panel,
    saveName,
    saveError,
    snippet,
    fmtTime,
    togglePanel,
    restoreRecord,
    dropRecord,
    clearHistory,
    useTemplate,
    dropTemplate,
    saveTemplate,
    run,
    stop,
    copy,
  };
}

export type AiEngine = ReturnType<typeof useAiEngine>;
