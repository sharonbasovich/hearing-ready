import { describe, expect, it } from 'vitest';
import { checkAddressMatch } from '../src/rentsafe';

describe('checkAddressMatch', () => {
  it('rejects an unrelated building record', () => {
    const m = checkAddressMatch('Unit 3, 999 Fictional Ave, Toronto ON (fictional)', '1325 YORK MILLS RD');
    expect(m.ok).toBe(false);
    expect(m.verifiable).toBe(true);
  });

  it('accepts an exact street-level match with unit designator', () => {
    const m = checkAddressMatch('Unit 3, 1325 York Mills Rd, Toronto ON', '1325 YORK MILLS RD');
    expect(m.ok).toBe(true);
  });

  it('normalizes street-type abbreviations', () => {
    expect(checkAddressMatch('12 Oak Street', '12 OAK ST').ok).toBe(true);
    expect(checkAddressMatch('55 Bloor St W, Suite 4', '55 BLOOR ST W').ok).toBe(true);
    expect(checkAddressMatch('Apt 2, 90 Broadway Avenue', '90 BROADWAY AVE').ok).toBe(true);
  });

  it('strips # / suite / apt unit prefixes before comparing', () => {
    expect(checkAddressMatch('#201, 77 Wellesley St E', '77 WELLESLEY ST E').ok).toBe(true);
    expect(checkAddressMatch('Suite 4, 55 Bloor St East', '55 BLOOR ST W').ok).toBe(false);
  });

  it('rejects when the street number differs but the name matches', () => {
    expect(checkAddressMatch('999 York Mills Rd', '1325 YORK MILLS RD').ok).toBe(false);
  });

  it('flags unverifiable cases instead of matching', () => {
    expect(checkAddressMatch('', '1325 YORK MILLS RD')).toMatchObject({ ok: false, verifiable: false });
    expect(checkAddressMatch('Unit 3', '1325 YORK MILLS RD').verifiable).toBe(false);
    expect(checkAddressMatch('999 Fictional Ave', '').verifiable).toBe(false);
  });
});
