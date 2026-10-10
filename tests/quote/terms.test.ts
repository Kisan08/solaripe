import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampYears, formErrors, horizon, isLoanType, isOpexType, loanSummary, PROJECT_TYPES, yearsIsValid,
} from '../../lib/quoteTerms';

test('a new quote offers exactly CAPEX, OPEX and Loan', () => {
  assert.deepEqual([...PROJECT_TYPES], ['CAPEX', 'OPEX', 'Loan']);
});

test('older project type names are still understood, never rejected', () => {
  assert.ok(isOpexType('OPEX') && isOpexType('OPEX / PPA'));
  assert.ok(!isOpexType('AMC') && !isOpexType('Hybrid') && !isOpexType('CAPEX (EPC)'));
  assert.ok(isLoanType('Loan') && !isLoanType('AMC'));
});

test('a quote saved before "Number of years" keeps its own periods', () => {
  assert.equal(horizon({ projectType: 'CAPEX (EPC)' }).capex, 25);
  assert.equal(horizon({ projectType: 'AMC' }).capex, 25);
  assert.equal(horizon({ projectType: 'OPEX / PPA', ppaTermYears: '15 Years' }).opex, 15);
  assert.equal(horizon({ projectType: 'OPEX / PPA', ppaTermYears: '10 Years' }).opex, 10);
  assert.equal(horizon({ projectType: 'OPEX / PPA' }).opex, 10);
  assert.equal(horizon({ projectType: 'Hybrid' }).chosen, false);
});

test('a quote with a chosen number of years uses it everywhere', () => {
  for (const type of ['CAPEX', 'OPEX', 'Loan']) {
    const h = horizon({ projectType: type, years: 7 });
    assert.deepEqual([h.capex, h.opex, h.loan, h.chosen], [7, 7, 7, true]);
  }
});

test('years: 1 to 25 are valid, everything else is not', () => {
  for (const ok of [1, 10, 25]) assert.ok(yearsIsValid(ok));
  for (const bad of [0, 26, -3, 7.5, NaN, undefined, '10']) assert.ok(!yearsIsValid(bad));
  assert.equal(clampYears(40), 25);
  assert.equal(clampYears(0), 1);
  assert.equal(clampYears(NaN), 10);
});

test('out-of-range years produce a clear message', () => {
  assert.deepEqual(formErrors({ projectType: 'CAPEX', years: 10 }), []);
  assert.deepEqual(formErrors({ projectType: 'CAPEX' }), []); // old quotes have no years
  for (const bad of [0, 26, NaN, 7.5]) {
    assert.match(formErrors({ projectType: 'CAPEX', years: bad })[0], /whole number from 1 to 25/);
  }
});

test('a Loan needs both an interest rate and a down payment', () => {
  assert.equal(formErrors({ projectType: 'Loan', years: 7 }).length, 2);
  assert.equal(formErrors({ projectType: 'Loan', years: 7, loanInterestRate: 9.5, loanDownPaymentPct: 20 }).length, 0);
  assert.equal(formErrors({ projectType: 'Loan', years: 7, loanInterestRate: 0, loanDownPaymentPct: 0 }).length, 0);
  assert.equal(formErrors({ projectType: 'Loan', years: 7, loanInterestRate: 9.5, loanDownPaymentPct: 100 }).length, 1);
  assert.equal(formErrors({ projectType: 'Loan', years: 7, loanInterestRate: 80, loanDownPaymentPct: 20 }).length, 1);
});

test('EMI matches a well-known example: 10 lakh at 12% for 1 year = Rs 88,849', () => {
  const l = loanSummary({ projectType: 'Loan', loanInterestRate: 12, loanDownPaymentPct: 20 }, 1_250_000, 1)!;
  assert.equal(l.downPayment, 250_000);
  assert.equal(l.principal, 1_000_000);
  assert.equal(l.emi, 88_849);
  assert.equal(l.months, 12);
  assert.equal(l.totalRepayment, 88_849 * 12);
  assert.equal(l.totalInterest, 88_849 * 12 - 1_000_000);
  assert.equal(l.totalPaid, 250_000 + 88_849 * 12);
});

test('0% interest simply divides the loan evenly', () => {
  const l = loanSummary({ projectType: 'Loan', loanInterestRate: 0, loanDownPaymentPct: 0 }, 1_200_000, 10)!;
  assert.equal(l.emi, 10_000);
  assert.equal(l.totalInterest, 0);
});

test('no loan summary unless it is a Loan with valid inputs and an amount to finance', () => {
  const ok = { projectType: 'Loan', loanInterestRate: 9, loanDownPaymentPct: 10 };
  assert.equal(loanSummary({ ...ok, projectType: 'CAPEX' }, 500_000, 5), null);
  assert.equal(loanSummary({ projectType: 'Loan' }, 500_000, 5), null);
  assert.equal(loanSummary({ ...ok, loanDownPaymentPct: 100 }, 500_000, 5), null);
  assert.equal(loanSummary(ok, 0, 5), null);
  assert.ok(loanSummary(ok, 500_000, 5));
});
