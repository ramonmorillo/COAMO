import { describe, expect, it } from 'vitest';

import { decideAccess } from '../src/services/accessDecision';

describe('decideAccess', () => {
  it('cuenta del proyecto sin perfil COAMO visible → sin acceso (no bucle de cambio de contraseña)', () => {
    expect(decideAccess({ error: false, profile: null })).toBe('no_access');
  });

  it('error de lectura → error (no se concede acceso)', () => {
    expect(decideAccess({ error: true })).toBe('error');
  });

  it('perfil desactivado → inactivo', () => {
    expect(decideAccess({ error: false, profile: { must_change_password: false, is_active: false } })).toBe('inactive');
  });

  it('contraseña temporal pendiente, o valor dudoso → exige cambiarla', () => {
    expect(decideAccess({ error: false, profile: { must_change_password: true, is_active: true } })).toBe('must_change_password');
    expect(decideAccess({ error: false, profile: { must_change_password: null, is_active: true } })).toBe('must_change_password');
  });

  it('perfil activo con contraseña propia → acceso', () => {
    expect(decideAccess({ error: false, profile: { must_change_password: false, is_active: true } })).toBe('ok');
  });
});
