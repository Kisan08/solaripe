import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isPlan, limitFor, limitMessage, periodKey, type Metric, type Plan } from '@/lib/usage/rules';

export interface UsageResult {
  ok: boolean;
  plan: Plan;
  limit: number;
  used: number;
  // Plain-words text to show the customer. Set when ok is false.
  message?: string;
  // True when the counter itself could not be reached; callers must treat
  // this as "stop", never as "allowed".
  unavailable?: boolean;
}

async function planFor(tenantId: string): Promise<Plan> {
  const { data, error } = await supabaseAdmin
    .from('tenant_plans').select('plan').eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  return isPlan(data?.plan) ? data.plan : 'starter';
}

// Counts `amount` uses against this account, but only if they fit under the
// limit. Fails closed: if the counter cannot be reached, nothing is allowed.
export async function consumeUsage(tenantId: string, metric: Metric, amount = 1): Promise<UsageResult> {
  let plan: Plan = 'starter';
  try {
    plan = await planFor(tenantId);
    const limit = limitFor(metric, plan);
    const { data, error } = await supabaseAdmin.rpc('consume_usage', {
      p_tenant: tenantId, p_metric: metric, p_period: periodKey(metric), p_amount: amount, p_limit: limit,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('empty usage response');
    if (row.allowed) return { ok: true, plan, limit, used: row.used_after };
    return { ok: false, plan, limit, used: row.used_after, message: limitMessage(metric, plan, limit) };
  } catch (err) {
    console.error('[usage] counter unavailable', metric, err);
    return {
      ok: false, plan, limit: limitFor(metric, plan), used: 0, unavailable: true,
      message: 'We could not check your usage limit right now, so this was not done. Please try again in a minute.',
    };
  }
}

// Gives a use back, for example when the phone company refused to dial.
export async function refundUsage(tenantId: string, metric: Metric, amount = 1): Promise<void> {
  const { error } = await supabaseAdmin.rpc('refund_usage', {
    p_tenant: tenantId, p_metric: metric, p_period: periodKey(metric), p_amount: amount,
  });
  if (error) console.error('[usage] refund failed', metric, error);
}
