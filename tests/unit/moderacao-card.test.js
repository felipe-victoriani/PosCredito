// Testes das regras de moderação e da quebra de texto do card de Stories.
import { describe, expect, it } from 'vitest';
import { idAlvo, idDenuncia, montarBloqueio, montarDenuncia, semBloqueados } from '../../public/js/moderacao-regras.js';
import { quebrarEmLinhas } from '../../public/js/share-card.js';

describe('moderação', () => {
  it('ids de alvo e de denúncia', () => {
    expect(idAlvo('review', 'u1_movie_603')).toBe('u1_movie_603');
    expect(idAlvo('comment', 'u1_movie_603', '-Nabc')).toBe('u1_movie_603~-Nabc');
    expect(idDenuncia('eu', 'review', 'u1_movie_603')).toBe('eu_review_u1_movie_603');
  });

  it('denúncia com detalhes opcionais e cortados', () => {
    const mapa = montarDenuncia({ uid: 'eu', tipo: 'review', alvo: 'r1', motivo: 'spam', detalhes: ` ${'x'.repeat(400)} `, carimbo: 1 });
    const denuncia = mapa['reports/eu_review_r1'];
    expect(denuncia).toMatchObject({ reporterUid: 'eu', targetType: 'review', targetId: 'r1', reason: 'spam', createdAt: 1 });
    expect(denuncia.details).toHaveLength(300);
    expect(montarDenuncia({ uid: 'eu', tipo: 'review', alvo: 'r1', motivo: 'spam', carimbo: 1 })['reports/eu_review_r1'].details).toBeUndefined();
  });

  it('bloqueio e filtro', () => {
    expect(montarBloqueio({ uid: 'eu', alvo: 'chato', bloquear: true })).toEqual({ 'blocks/eu/chato': true });
    expect(montarBloqueio({ uid: 'eu', alvo: 'chato', bloquear: false })).toEqual({ 'blocks/eu/chato': null });
    const itens = [{ review: { uid: 'a' } }, { review: { uid: 'chato' } }];
    expect(semBloqueados(itens, new Set(['chato']))).toEqual([{ review: { uid: 'a' } }]);
    expect(semBloqueados(itens, new Set())).toHaveLength(2);
  });
});

describe('quebrarEmLinhas (card)', () => {
  // Cada caractere "mede" 10px
  const medir = (s) => s.length * 10;

  it('quebra por palavras respeitando a largura', () => {
    expect(quebrarEmLinhas('um dois tres quatro', 90, medir, 5)).toEqual(['um dois', 'tres', 'quatro']);
  });

  it('corta com reticências quando passa do máximo de linhas', () => {
    const linhas = quebrarEmLinhas('aaa bbb ccc ddd eee', 70, medir, 2);
    expect(linhas).toHaveLength(2);
    expect(linhas.at(-1).endsWith('…')).toBe(true);
    expect(medir(linhas.at(-1))).toBeLessThanOrEqual(70);
  });

  it('palavra gigante é cortada em pedaços', () => {
    const linhas = quebrarEmLinhas('x'.repeat(25), 100, medir, 5);
    expect(linhas.every((l) => medir(l) <= 100)).toBe(true);
    expect(linhas.join('')).toBe('x'.repeat(25));
  });

  it('normaliza espaços e quebras', () => {
    expect(quebrarEmLinhas('  oi \n\n tudo   bem ', 200, medir, 3)).toEqual(['oi tudo bem']);
  });
});
