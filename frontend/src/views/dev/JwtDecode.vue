<script setup lang="ts">
/**
 * JWT decoder. Decodes only — verifying a signature needs the secret, and
 * asking for one in a local toolbox invites pasting production keys around.
 */
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import ToolFrame from "../../work/ToolFrame.vue";
import InspectorSection from "../../work/InspectorSection.vue";
import Icon from "../../components/Icon.vue";
import { t } from "../../lib/i18n";
import { copyText } from "../../stores/toast";
import { decodeJwt, toBase64Url, utf8ToBase64 } from "../../lib/codec";

const SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc2NzIyNTYwMCwiZXhwIjoyMDAwMDAwMDAwfQ." +
  "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const route = useRoute();
const mode = ref<"decode" | "sign">("decode");
watch(
  () => route.query.mode,
  (q) => {
    if (q === "sign" || q === "decode") mode.value = q;
  },
  { immediate: true },
);

const token = ref("");
const info = computed(() => decodeJwt(token.value));

const headerText = ref('{\n  "alg": "HS256",\n  "typ": "JWT"\n}');
const payloadText = ref("");
const secret = ref("");
const signed = ref("");
const signError = ref("");

function freshPayload() {
  payloadText.value = JSON.stringify({ sub: "demo-user", iat: Math.floor(Date.now() / 1000) }, null, 2);
}
freshPayload();

const headerOk = computed(() => {
  try {
    return typeof JSON.parse(headerText.value) === "object";
  } catch {
    return false;
  }
});

async function sign() {
  signError.value = "";
  signed.value = "";
  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(headerText.value);
  } catch (e) {
    signError.value = `${t("jwte.headerErr")}: ${(e as Error).message}`;
    return;
  }
  try {
    payload = JSON.parse(payloadText.value);
  } catch (e) {
    signError.value = `${t("jwte.payloadErr")}: ${(e as Error).message}`;
    return;
  }
  if (!secret.value) {
    signError.value = t("jwte.secretEmpty");
    return;
  }
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret.value), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const body = `${toBase64Url(utf8ToBase64(JSON.stringify(header)))}.${toBase64Url(utf8ToBase64(JSON.stringify(payload)))}`;
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    const sigB64 = toBase64Url(btoa(String.fromCharCode(...new Uint8Array(sig))));
    signed.value = `${body}.${sigB64}`;
  } catch (e) {
    signError.value = (e as Error).message;
  }
}

/** The three dot-separated segments, coloured so the structure is obvious. */
const segments = computed(() => {
  const parts = token.value.trim().split(".");
  if (parts.length !== 3) return [];
  return [
    { cls: "s-head", text: parts[0] },
    { cls: "s-dot", text: "." },
    { cls: "s-body", text: parts[1] },
    { cls: "s-dot", text: "." },
    { cls: "s-sig", text: parts[2] },
  ];
});

const alg = computed(() => {
  try {
    return JSON.parse(info.value.header.json || "{}").alg ?? "";
  } catch {
    return "";
  }
});

const algWarning = computed(() => alg.value === "none" || alg.value === "None");
</script>

<template>
  <ToolFrame tool-id="jwt-decode" shape="flow">
    <div class="seg">
      <button :class="{ on: mode === 'decode' }" @click="mode = 'decode'">{{ t("jwt.modeDecode") }}</button>
      <button :class="{ on: mode === 'sign' }" @click="mode = 'sign'">{{ t("jwt.modeSign") }}</button>
    </div>

    <template v-if="mode === 'decode'">
    <div class="row">
      <button class="chip" @click="token = SAMPLE">{{ t("jwt.sample") }}</button>
      <button class="chip" :disabled="!token" @click="token = ''">{{ t("common.clear") }}</button>
    </div>

    <div class="field">
      <span class="lab">{{ t("jwt.token") }}</span>
      <textarea
        v-model="token"
        class="textarea mono tok"
        :class="{ bad: !!info.error }"
        :placeholder="t('jwt.tokenPh')"
        spellcheck="false"
      ></textarea>
      <p v-if="info.error" class="err">{{ info.error }}</p>
    </div>

    <!-- Coloured segmentation makes the three-part structure legible. -->
    <div v-if="segments.length" class="field">
      <span class="lab">{{ t("jwt.structure") }}</span>
      <div class="segview mono">
        <span v-for="(s, i) in segments" :key="i" :class="s.cls">{{ s.text }}</span>
      </div>
      <div class="legend">
        <span class="s-head">{{ t("jwt.header") }}</span>
        <span class="s-body">{{ t("jwt.payload") }}</span>
        <span class="s-sig">{{ t("jwt.signature") }}</span>
      </div>
    </div>
    </template>

    <template v-else>
      <div class="field">
        <span class="lab">{{ t("jwte.header") }}</span>
        <textarea v-model="headerText" class="textarea mono small" :class="{ bad: !headerOk }" spellcheck="false"></textarea>
      </div>
      <div class="field grow-field">
        <span class="lab">{{ t("jwte.payload") }}</span>
        <textarea v-model="payloadText" class="textarea mono doc" spellcheck="false"></textarea>
      </div>
      <div class="field">
        <span class="lab">{{ t("jwte.secret") }}</span>
        <div class="secret-row">
          <input v-model="secret" type="password" class="input mono grow" :placeholder="t('jwte.secretPh')" spellcheck="false" />
          <button class="btn btn-sm" :disabled="!secret" @click="sign">
            <Icon name="PenLine" /> {{ t("jwte.sign") }}
          </button>
        </div>
        <p class="hint">{{ t("jwte.hint") }}</p>
      </div>
    </template>

    <template v-if="mode === 'decode'" #result>
      <div class="res-head">
        <span class="lab">{{ t("jwt.decoded") }}</span>
        <span v-if="alg" class="badge" :class="algWarning ? 'fail' : 'acc'">{{ alg }}</span>
      </div>

      <div class="res-body scroll-y">
        <p v-if="algWarning" class="banner fail">
          <Icon name="TriangleAlert" /> {{ t("jwt.algNone") }}
        </p>

        <template v-if="info.header.json || info.payload.json">
          <div class="block">
            <div class="block-head">
              <span class="lab">{{ t("jwt.header") }}</span>
              <button
                class="btn btn-sm btn-quiet"
                @click="copyText(info.header.json, t('common.copied'))"
              >
                <Icon name="Copy" />
              </button>
            </div>
            <pre class="json mono">{{ info.header.json || info.header.error }}</pre>
          </div>

          <div class="block">
            <div class="block-head">
              <span class="lab">{{ t("jwt.payload") }}</span>
              <button
                class="btn btn-sm btn-quiet"
                @click="copyText(info.payload.json, t('common.copied'))"
              >
                <Icon name="Copy" />
              </button>
            </div>
            <pre class="json mono">{{ info.payload.json || info.payload.error }}</pre>
          </div>
        </template>
        <p v-else class="hint pad">{{ t("jwt.idle") }}</p>
      </div>
    </template>

    <template v-else #result>
      <div class="res-head">
        <span class="lab">{{ t("jwte.result") }}</span>
        <button class="btn btn-sm btn-quiet" :disabled="!signed" @click="copyText(signed, t('common.copied'))">
          <Icon name="Copy" />
        </button>
      </div>
      <div class="res-body scroll-y">
        <p v-if="signError" class="err">{{ signError }}</p>
        <p v-else-if="signed" class="mono tok-out">{{ signed }}</p>
        <p v-else class="hint pad">{{ t("jwte.idle") }}</p>
      </div>
    </template>

    <template v-if="mode === 'decode'" #inspector>
      <InspectorSection :title="t('jwt.claims')" icon="BadgeCheck">
        <div v-if="info.claims.length" class="claims">
          <div v-for="c in info.claims" :key="c.key" class="claim">
            <div class="claim-head">
              <code class="mono ckey">{{ c.key }}</code>
              <span class="clabel">{{ c.label }}</span>
              <span v-if="c.expired === true" class="badge fail">{{ t("jwt.expired") }}</span>
              <span v-else-if="c.expired === false" class="badge ok">{{ t("jwt.valid") }}</span>
            </div>
            <span class="cval">{{ c.value }}</span>
          </div>
        </div>
        <p v-else class="hint">{{ t("jwt.noClaims") }}</p>
      </InspectorSection>

      <InspectorSection :title="t('jwt.about')" icon="Info" :open="false">
        <p class="hint">{{ t("jwt.aboutText") }}</p>
      </InspectorSection>
    </template>
  </ToolFrame>
</template>

<style scoped>
.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tok, .tok-out {
  min-height: 130px;
  font-size: var(--t-sm);
  word-break: break-all;
}
.tok-out { min-height: 0; padding: 12px; }
.small { min-height: 76px; }
.doc { flex: 1; min-height: 120px; }
.secret-row { display: flex; align-items: center; gap: 8px; }
.grow { flex: 1; }

.textarea.bad {
  border-color: var(--fail);
}

.err {
  font-size: var(--t-xs);
  color: var(--fail);
}

/* Structure view: each segment gets its own hue so the dots read as joints. */
.segview {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-sunken);
  font-size: var(--t-sm);
  line-height: 1.8;
  word-break: break-all;
  user-select: text;
}

.s-head {
  color: var(--fail);
}
.s-body {
  color: var(--acc);
}
.s-sig {
  color: var(--ok);
}
.s-dot {
  color: var(--ink-3);
  font-weight: 700;
}

.legend {
  display: flex;
  gap: 14px;
  font-size: var(--t-xs);
  font-weight: 600;
}

.res-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.res-body {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pad {
  padding: 4px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.block-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.block-head .btn {
  margin-left: auto;
}

.json {
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
  font-size: var(--t-sm);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

.claims {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.claim {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--s-1);
}

.claim-head {
  display: flex;
  align-items: center;
  gap: 7px;
}

.ckey {
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--acc);
}

.clabel {
  font-size: var(--t-xs);
  color: var(--ink-3);
}

.cval {
  font-size: var(--t-sm);
  color: var(--ink);
  word-break: break-all;
  user-select: text;
}
</style>
