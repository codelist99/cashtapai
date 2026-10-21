(() => {
  const query = new URLSearchParams(location.search);
  const withQuery = path => query.toString() ? `${path}?${query}` : path;
  const oto = location.pathname.match(/^\/oto([1-7])-e\/?$/);

  document.addEventListener('click', async event => {
    const link = event.composedPath().find(node => node?.tagName === 'A' && node.href);
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
