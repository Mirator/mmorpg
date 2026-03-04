import { describe, expect, it } from 'vitest';
import { FakeElement, createFakeDocument } from '../client/test/fakeDom.js';
import { bindElementRefs, bindQueryRefs } from './domRefs.js';

describe('domRefs helpers', () => {
  it('binds ids and preserves missing nodes as null', () => {
    const { document, elements } = createFakeDocument(['alpha', 'beta']);

    const refs = bindElementRefs(document, {
      alphaEl: 'alpha',
      betaEl: 'beta',
      missingEl: 'missing',
    });

    expect(refs).toEqual({
      alphaEl: elements.alpha,
      betaEl: elements.beta,
      missingEl: null,
    });
  });

  it('binds query selectors from any query-capable root', () => {
    const root = new FakeElement('section');
    const first = new FakeElement('button');
    first.classList.add('item');
    const second = new FakeElement('button');
    second.classList.add('item');
    const third = new FakeElement('div');
    third.classList.add('other');
    root.appendChild(first);
    root.appendChild(second);
    root.appendChild(third);

    const refs = bindQueryRefs(root, {
      items: '.item',
      others: '.other',
    });

    expect(refs.items).toEqual([first, second]);
    expect(refs.others).toEqual([third]);
  });
});
