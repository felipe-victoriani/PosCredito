// Testes das regras puras de perfil (public/js/perfil-regras.js) e interesses.
import { describe, expect, it } from 'vitest';
import { GENEROS, lerInteresses, montarInteresses, TIPOS } from '../../public/js/interesses.js';
import {
  chaveUsername,
  formatarContador,
  fotoSegura,
  iniciais,
  indiceCorAvatar,
  normalizarUsername,
  validarUsername,
} from '../../public/js/perfil-regras.js';

describe('normalizarUsername', () => {
  it('tira @, acentos, maiúsculas e caracteres proibidos', () => {
    expect(normalizarUsername('@Marina.Cine')).toBe('marina.cine');
    expect(normalizarUsername('  João Café_99 ')).toBe('joaocafe_99');
    expect(normalizarUsername('a<script>b')).toBe('ascriptb');
  });
});

describe('validarUsername', () => {
  it('aceita @ válidos', () => {
    for (const u of ['marina.cine', 'kenji_otaku', 'abc', 'a'.repeat(20)]) expect(validarUsername(u)).toBeNull();
  });

  it.each([
    ['ab', 'pelo menos 3'],
    ['a'.repeat(21), 'no máximo 20'],
    ['.marina', 'ponto'],
    ['marina.', 'ponto'],
    ['mari..na', 'dois pontos'],
    ['admin', 'reservado'],
  ])('recusa %s', (username, trecho) => {
    expect(validarUsername(username)).toContain(trecho);
  });
});

describe('helpers de perfil', () => {
  it('chaveUsername troca todos os pontos por vírgula', () => {
    expect(chaveUsername('um.dois.tres')).toBe('um,dois,tres');
  });

  it('iniciais', () => {
    expect(iniciais('Marina Rocha')).toBe('MR');
    expect(iniciais('Thiago Kenji Sato')).toBe('TS');
    expect(iniciais('Cher')).toBe('C');
    expect(iniciais('')).toBe('?');
  });

  it('cor do avatar é estável e dentro da paleta', () => {
    expect(indiceCorAvatar('abc123')).toBe(indiceCorAvatar('abc123'));
    expect(indiceCorAvatar('xyz')).toBeGreaterThanOrEqual(0);
    expect(indiceCorAvatar('xyz')).toBeLessThan(6);
  });

  it('fotoSegura só aceita foto do Google', () => {
    expect(fotoSegura('https://lh3.googleusercontent.com/a/abc')).toBe('https://lh3.googleusercontent.com/a/abc');
    expect(fotoSegura('https://malicioso.com/x.png')).toBeNull();
    expect(fotoSegura('javascript:alert(1)')).toBeNull();
    expect(fotoSegura(null)).toBeNull();
  });

  it('formatarContador', () => {
    expect(formatarContador(0)).toBe('0');
    expect(formatarContador(999)).toBe('999');
    expect(formatarContador(1250)).toBe('1,2 mil');
    expect(formatarContador(2_300_000)).toBe('2,3 mi');
  });
});

describe('interesses', () => {
  it('ida e volta entre listas e o formato do banco', () => {
    const banco = montarInteresses(['anime', 'dorama'], ['terror']);
    expect(banco).toEqual({ tipos: { anime: true, dorama: true }, generos: { terror: true } });
    expect(lerInteresses(banco)).toEqual({ tipos: ['anime', 'dorama'], generos: ['terror'] });
    expect(lerInteresses(undefined)).toEqual({ tipos: [], generos: [] });
  });

  it('ids seguem o formato aceito pelas regras (só letras minúsculas)', () => {
    for (const { id } of [...TIPOS, ...GENEROS]) expect(id).toMatch(/^[a-z]{1,20}$/);
  });

  it('inclui Reality shows e não inclui Shōnen', () => {
    expect(TIPOS.map((t) => t.id)).toContain('reality');
    expect(GENEROS.map((g) => g.rotulo)).not.toContain('Shōnen');
  });
});
