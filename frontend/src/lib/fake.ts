/**
 * Plausible test data, generated locally.
 *
 * "Plausible" is the whole point: an ID number whose checksum does not add up
 * gets rejected by the very form you are trying to test, and a card number
 * that fails Luhn never reaches the code you meant to exercise. So the two
 * pieces that have a real algorithm behind them get the real algorithm.
 *
 * Nothing here comes from a public register — the region codes are the
 * published prefixes for provinces, and every other digit is drawn at random.
 */

export type Rand = () => number;

const pick = <T>(list: readonly T[], rand: Rand): T => list[Math.floor(rand() * list.length)];
const digits = (n: number, rand: Rand) =>
  Array.from({ length: n }, () => Math.floor(rand() * 10)).join("");
const between = (lo: number, hi: number, rand: Rand) => lo + Math.floor(rand() * (hi - lo + 1));

const SURNAMES =
  "王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廉贾夏韦付方白邹孟熊秦邱侯江尹薛闫段雷黎史陶毛郝顾龚邵万钱严覃武戴莫孔向汤";
const GIVEN_CHARS = "伟芳娜秀英敏静丽强磊军洋勇艳杰娟涛明超霞平刚辉玲兰华文博涵萱浩然诺欣怡泽思远嘉晨曦雅若墨语宇轩";

const EMAIL_HOSTS = ["gmail.com", "outlook.com", "qq.com", "163.com", "126.com", "foxmail.com"];
const COMPANY_PLACE = "北京上海广州深圳杭州成都南京武汉西安苏州天津重庆长沙青岛宁波";
const COMPANY_WORD = ["科技", "网络", "信息", "数据", "智能", "软件", "电子", "文化", "传媒", "生物"];
const COMPANY_TAIL = ["有限公司", "股份有限公司", "科技有限公司", "集团有限公司"];
const STREET = ["中山路", "人民路", "解放路", "建设路", "新华路", "长江路", "和平路", "光明街"];
const DISTRICT = ["东城区", "西城区", "海淀区", "朝阳区", "高新区", "开发区", "江北区", "南山区"];

/** Published province prefixes; the last four digits of a code are made up. */
const PROVINCES: [string, string][] = [
  ["11", "北京市"],
  ["12", "天津市"],
  ["31", "上海市"],
  ["50", "重庆市"],
  ["32", "江苏省"],
  ["33", "浙江省"],
  ["44", "广东省"],
  ["51", "四川省"],
  ["42", "湖北省"],
  ["61", "陕西省"],
  ["37", "山东省"],
  ["41", "河南省"],
];

export function chineseName(rand: Rand = Math.random): string {
  const surname = pick([...SURNAMES], rand);
  const len = rand() < 0.35 ? 1 : 2;
  return surname + Array.from({ length: len }, () => pick([...GIVEN_CHARS], rand)).join("");
}

export function phone(rand: Rand = Math.random): string {
  // Real allocated prefixes; a number outside them fails most form validators.
  const prefix = pick(
    ["130", "131", "132", "133", "135", "136", "137", "138", "139", "150", "151", "152",
     "153", "155", "156", "157", "158", "159", "166", "170", "173", "175", "176", "177",
     "178", "180", "181", "182", "183", "185", "186", "187", "188", "189", "199"],
    rand,
  );
  return prefix + digits(8, rand);
}

/**
 * The ISO 7064 MOD 11-2 check character that ends a mainland ID number.
 *
 * Weights are 2^(17-i) mod 11 for the first seventeen digits; the eighteenth
 * character is the one that makes the weighted sum divisible by 11, and it is
 * `X` when that character would be ten.
 */
const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK = "10X98765432";

export function idChecksum(first17: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(first17[i]) * ID_WEIGHTS[i];
  return ID_CHECK[sum % 11];
}

export function isValidId(id: string): boolean {
  if (!/^\d{17}[\dX]$/.test(id.toUpperCase())) return false;
  return idChecksum(id.slice(0, 17)) === id[17].toUpperCase();
}

export function idNumber(rand: Rand = Math.random): string {
  const [prefix] = pick(PROVINCES, rand);
  const region = prefix + digits(4, rand);
  const year = between(1950, 2007, rand);
  const month = between(1, 12, rand);
  // 28 for every month: no generated date can land on a day that never was.
  const day = between(1, 28, rand);
  const birth = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
  const seq = digits(3, rand);
  const first17 = region + birth + seq;
  return first17 + idChecksum(first17);
}

/** Luhn check digit — the one every card number in the world ends with. */
export function luhnCheck(partial: string): string {
  let sum = 0;
  let double = true; // the check digit position makes the last body digit doubled
  for (let i = partial.length - 1; i >= 0; i--) {
    let d = Number(partial[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    double = !double;
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidLuhn(number: string): boolean {
  const s = number.replace(/[\s-]/g, "");
  if (!/^\d{2,}$/.test(s)) return false;
  return luhnCheck(s.slice(0, -1)) === s[s.length - 1];
}

export function bankCard(rand: Rand = Math.random): string {
  // Issuer prefixes that exist, so the number looks like the bank it claims.
  const bin = pick(["621226", "622202", "622848", "622700", "622588", "622609"], rand);
  const body = bin + digits(12, rand);
  return body + luhnCheck(body);
}

export function email(rand: Rand = Math.random): string {
  const name = Array.from({ length: between(5, 10, rand) }, () =>
    pick([..."abcdefghijklmnopqrstuvwxyz"], rand),
  ).join("");
  return `${name}${between(1, 999, rand)}@${pick(EMAIL_HOSTS, rand)}`;
}

export function company(rand: Rand = Math.random): string {
  const place = pick([...COMPANY_PLACE], rand) + pick([...COMPANY_PLACE], rand);
  const word = Array.from({ length: 2 }, () => pick([...GIVEN_CHARS], rand)).join("");
  return place + word + pick(COMPANY_WORD, rand) + pick(COMPANY_TAIL, rand);
}

export function address(rand: Rand = Math.random): string {
  const [, province] = pick(PROVINCES, rand);
  return `${province}${pick(DISTRICT, rand)}${pick(STREET, rand)}${between(1, 999, rand)}号${between(1, 30, rand)}栋${between(101, 2999, rand)}室`;
}

export function ipv4(rand: Rand = Math.random): string {
  return [between(1, 223, rand), between(0, 255, rand), between(0, 255, rand), between(1, 254, rand)].join(".");
}

export function macAddress(rand: Rand = Math.random): string {
  return Array.from({ length: 6 }, () =>
    between(0, 255, rand).toString(16).padStart(2, "0").toUpperCase(),
  ).join(":");
}

export function plate(rand: Rand = Math.random): string {
  const province = pick([..."京津沪渝冀豫云辽黑湘皖鲁苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青琼宁"], rand);
  // No I or O on a Chinese plate — they read as 1 and 0.
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return (
    province +
    pick([...letters], rand) +
    Array.from({ length: 5 }, () => pick([...(letters + "0123456789")], rand)).join("")
  );
}

export function datetime(rand: Rand = Math.random): string {
  const y = between(2020, 2026, rand);
  const m = between(1, 12, rand);
  const d = between(1, 28, rand);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(d)} ${p(between(0, 23, rand))}:${p(between(0, 59, rand))}:${p(between(0, 59, rand))}`;
}

export type FakeKind =
  | "name"
  | "phone"
  | "id"
  | "email"
  | "company"
  | "address"
  | "bankCard"
  | "ipv4"
  | "mac"
  | "plate"
  | "datetime";

const MAKERS: Record<FakeKind, (rand: Rand) => string> = {
  name: chineseName,
  phone,
  id: idNumber,
  email,
  company,
  address,
  bankCard,
  ipv4,
  mac: macAddress,
  plate,
  datetime,
};

export const FAKE_KINDS = Object.keys(MAKERS) as FakeKind[];

export function generateFake(kind: FakeKind, count = 10, rand: Rand = Math.random): string[] {
  const n = Math.min(1000, Math.max(1, Math.floor(count)));
  return Array.from({ length: n }, () => MAKERS[kind](rand));
}

/** One row per person, for pasting into a fixture or a spreadsheet. */
export function generateRows(kinds: FakeKind[], count = 10, rand: Rand = Math.random): string[][] {
  const n = Math.min(1000, Math.max(1, Math.floor(count)));
  return Array.from({ length: n }, () => kinds.map((k) => MAKERS[k](rand)));
}
