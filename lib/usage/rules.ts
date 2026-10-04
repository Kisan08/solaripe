export type Plan = 'starter' | 'growth' | 'enterprise';
export type Metric = 'ai_call' | 'whatsapp' | 'ai_chat' | 'google_lookup';

export const PLAN_LABEL: Record<Plan, string> = { starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' };

// Monthly allowances per plan.
const MONTHLY: Partial<Record<Metric, Record<Plan, number>>> = {
  ai_call: { starter: 80, growth: 250, enterprise: 600 },
  whatsapp: { starter: 150, growth: 500, enterprise: 1500 },
};

// Daily allowances, the same for every plan.
const DAILY: Partial<Record<Metric, number>> = {
  ai_chat: 100,
  google_lookup: 100,
};

// Most calls one click of "Call All" may start.
export const CALL_ALL_MAX_PER_RUN = 100;

const NAME: Record<Metric, { single: string; plural: string }> = {
  ai_call: { single: 'AI call', plural: 'AI calls' },
  whatsapp: { single: 'WhatsApp message', plural: 'WhatsApp messages' },
  ai_chat: { single: 'AI chat message', plural: 'AI chat messages' },
  google_lookup: { single: 'map lookup', plural: 'map lookups' },
};

export function isPlan(value: unknown): value is Plan {
  return value === 'starter' || value === 'growth' || value === 'enterprise';
}

export function limitFor(metric: Metric, plan: Plan): number {
  const monthly = MONTHLY[metric];
  if (monthly) return monthly[plan];
  return DAILY[metric] ?? 0;
}

export function isDaily(metric: Metric): boolean {
  return DAILY[metric] !== undefined;
}

// India time (UTC+5:30), so a "day" or "month" matches the customer's own.
function istParts(now: number) {
  const iso = new Date(now + 5.5 * 3600_000).toISOString();
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)), day: iso.slice(8, 10) };
}

export function periodKey(metric: Metric, now = Date.now()): string {
  const iso = new Date(now + 5.5 * 3600_000).toISOString();
  return isDaily(metric) ? iso.slice(0, 10) : iso.slice(0, 7);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function limitMessage(metric: Metric, plan: Plan, limit: number, now = Date.now()): string {
  const name = NAME[metric];
  if (isDaily(metric)) {
    return `You have reached today's limit of ${limit} ${name.plural}. The limit resets at midnight India time, so please try again tomorrow.`;
  }
  const { year, month } = istParts(now);
  const next = month === 12 ? { m: 1, y: year + 1 } : { m: month + 1, y: year };
  return `You have used all ${limit} ${name.plural} included in your ${PLAN_LABEL[plan]} plan this month. `
    + `The count resets on 1 ${MONTHS[next.m - 1]} ${next.y}. Please upgrade your plan to send more.`;
}
