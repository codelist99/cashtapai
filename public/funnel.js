(() => {
  const query = new URLSearchParams(location.search);
  const withQuery = path => query.toString() ? `${path}?${query}` : path;
  const oto = location.pathname.match(/^\/oto([1-7])-e\/?$/);
  const nextOffer = () => {
    if (!oto) return '/checkout';
    const number = Number(oto[1]);
    return number < 7 ? `/oto${number + 1}-e` : '/thankyou-e';
  };

  document.addEventListener('click', async event => {
    const link = event.composedPath().find(node => node?.tagName === 'A' && node.href);
    const clicked = event.composedPath().find(node => node?.nodeType === 1);
    const label = (link || clicked)?.textContent?.replace(/\s+/g, ' ').trim() || '';

    // The mirrored page framework inserts its decline control after the VSL
    // delay. Keep that path under our control even if its original client-side
    // router fails to hydrate.
    if (oto && /no thanks/i.test(label)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return location.assign(withQuery(nextOffer()));
    }

    if (!link || !/explodely\.com\/p\//i.test(link.href)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!oto) return location.assign(withQuery('/checkout'));

    const discounted = new URL(link.href).searchParams.has('cid');
    const product = `oto${oto[1]}${discounted ? '_discount' : ''}`;
    const previous = link.style.pointerEvents;
    link.style.pointerEvents = 'none';
    try {
      const response = await fetch('/api/purchase', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({product})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The upgrade could not be completed');
      location.assign(withQuery(data.next));
    } catch(error) {
      link.style.pointerEvents = previous;
      alert(error.message);
    }
  }, true);
})();
