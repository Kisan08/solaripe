import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PROFILE, PROFILE_LIMITS, normalizeProfile, profileHasContent, profileView,
} from '../../lib/companyProfile';
import { INVERTER_BRANDS, PANEL_BRANDS, cleanBrand } from '../../lib/brands';
import { partnerLogoProblem, PARTNER_BRAND_MAX, PARTNER_LOGO_MAX_BYTES } from '../../lib/media';

test('the company profile starts completely empty and prints nothing', () => {
  assert.ok(Object.values(EMPTY_PROFILE).every((v) => v === ''));
  assert.equal(profileHasContent(EMPTY_PROFILE), false);
  assert.deepEqual(profileView(EMPTY_PROFILE), { about: '', stats: [], certifications: [], whyChooseUs: [] });
});

test('whitespace-only fields count as empty, so no empty page is added', () => {
  assert.equal(profileHasContent({ ...EMPTY_PROFILE, about: '   \n  ', certifications: '\n\n', whyChooseUs: ' ' }), false);
});

test('any single filled field is enough for a profile page, and only that field prints', () => {
  const v = profileView({ ...EMPTY_PROFILE, yearsInBusiness: '12' });
  assert.equal(profileHasContent({ ...EMPTY_PROFILE, yearsInBusiness: '12' }), true);
  assert.deepEqual(v.stats, [{ label: 'Years in business', value: '12' }]);
  assert.equal(v.about, '');
  assert.equal(v.certifications.length, 0);
});

test('limits: about 600 characters, why-choose-us 5 lines, certifications 10 lines', () => {
  const p = normalizeProfile({
    about: 'x'.repeat(900),
    whyChooseUs: ['a', 'b', '', 'c', 'd', 'e', 'f', 'g'].join('\n'),
    certifications: Array.from({ length: 14 }, (_, i) => `cert ${i + 1}`).join('\n'),
    yearsInBusiness: 'y'.repeat(60),
  });
  assert.equal(p.about.length, PROFILE_LIMITS.about);
  assert.deepEqual(p.whyChooseUs.split('\n'), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(p.certifications.split('\n').length, PROFILE_LIMITS.certLines);
  assert.equal(p.yearsInBusiness.length, PROFILE_LIMITS.stat);
});

test('anything stored in an odd shape becomes a safe empty profile', () => {
  for (const odd of [null, undefined, 'text', 42, [], {}]) assert.deepEqual(normalizeProfile(odd), EMPTY_PROFILE);
});

test('brand lists: exactly the brands asked for, once each, in one place', () => {
  assert.equal(INVERTER_BRANDS.length, 20);
  assert.equal(PANEL_BRANDS.length, 27);
  assert.equal(new Set(INVERTER_BRANDS).size, 20);
  assert.equal(new Set(PANEL_BRANDS).size, 27);
  assert.deepEqual(INVERTER_BRANDS.slice(0, 3), ['Growatt', 'Solis', 'Sungrow']);
  assert.equal(INVERTER_BRANDS[11], 'Waaree');
  assert.equal(INVERTER_BRANDS[19], 'Fimer');
  assert.deepEqual(PANEL_BRANDS.slice(0, 2), ['Waaree', 'Adani Solar']);
  assert.equal(PANEL_BRANDS[15], 'Canadian Solar');
  assert.equal(PANEL_BRANDS[26], 'REC');
});

test('a typed brand is tidied and bounded', () => {
  assert.equal(cleanBrand('  Jakson   Solar \n Pro '), 'Jakson Solar Pro');
  assert.equal(cleanBrand(undefined), '');
  assert.equal(cleanBrand('x'.repeat(200)).length, 60);
});

test('partner logos: PNG or JPG only, 1 MB at most, up to 8', () => {
  assert.equal(PARTNER_BRAND_MAX, 8);
  assert.equal(PARTNER_LOGO_MAX_BYTES, 1024 * 1024);
  assert.equal(partnerLogoProblem({ type: 'image/png', size: 500_000 }), null);
  assert.equal(partnerLogoProblem({ type: 'image/jpeg', size: PARTNER_LOGO_MAX_BYTES }), null);
  assert.match(partnerLogoProblem({ type: 'image/png', size: PARTNER_LOGO_MAX_BYTES + 1 })!, /1 MB/);
  for (const bad of ['image/gif', 'image/webp', 'image/svg+xml', 'application/pdf', 'text/plain', '']) {
    assert.match(partnerLogoProblem({ type: bad, size: 100 })!, /PNG or JPG/);
  }
});
