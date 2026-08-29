const LA = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
  "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
  "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
  "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
  "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
  "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
  "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
  "deserunt", "mollit", "anim", "id", "est", "laborum",
];

const ZH = [
  "在本地完成重复劳动", "不必把草稿送上云端", "打开工具箱即可开始",
  "文本图片与文档都能处理", "结果写回本机文件夹", "快捷键随时唤出命令面板",
  "收藏常用工具以便下次使用", "把文件拖到窗口会推荐能处理它的工具",
  "设置保存在本机数据库", "界面跟随系统外观",
];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pick<T>(list: T[], r: () => number): T {
  return list[Math.floor(r() * list.length)]!;
}

function sentenceLa(r: () => number): string {
  const n = 8 + Math.floor(r() * 10);
  const words = Array.from({ length: n }, () => pick(LA, r));
  words[0] = words[0]![0]!.toUpperCase() + words[0]!.slice(1);
  return `${words.join(" ")}.`;
}

export function lorem(opts: {
  lang: "la" | "zh";
  paragraphs: number;
  sentences?: number;
  seed?: number;
}): string {
  const r = rng(opts.seed ?? 1);
  const paras = Math.max(1, Math.min(opts.paragraphs, 30));
  const per = Math.max(1, Math.min(opts.sentences ?? 4, 12));
  const blocks: string[] = [];
  for (let i = 0; i < paras; i++) {
    if (opts.lang === "zh") {
      const parts = Array.from({ length: per }, () => pick(ZH, r) + "。");
      blocks.push(parts.join(""));
    } else {
      blocks.push(Array.from({ length: per }, () => sentenceLa(r)).join(" "));
    }
  }
  return blocks.join("\n\n");
}
