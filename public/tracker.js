(() => {
  if (false && /^\/thankyou\/?$/.test(location.pathname)) {
    const ensureCallout = () => {
      if (document.querySelector('.wc-call-now')) return;
      const callout = document.createElement('section');
      callout.className = 'wc-call-now';
      callout.innerHTML = '<div><h1>Congratulations</h1><p class="thanks">Thanks for purchasing WifiCode</p><strong>YOUR ORDER IS COMPLETE</strong><h2>Step 1: Call Our Office Now To Get Started</h2><a class="phone" href="tel:+12067032153">(206) 703-2153</a><p>Tap the number or call now so our team can help you get started.</p><div class="or">— OR —</div><a class="schedule" href="https://cal.com/support-staff-wznd51/wificode-onboarding" target="_blank" rel="noreferrer noopener">Schedule Your Onboarding Call</a></div>';
      document.body.prepend(callout);
    };
    if (!document.getElementById('wc-call-now-style')) {
      const style = document.createElement('style');
      style.id = 'wc-call-now-style';
      style.textContent = '.wc-call-now{position:relative!important;display:block!important;z-index:99999;background:linear-gradient(135deg,#050a54,#0b4db8);color:#fff;text-align:center;padding:42px 18px;border-bottom:8px solid #ffd43b;box-shadow:0 10px 35px #0005}.wc-call-now>div{max-width:1050px;margin:auto}.wc-call-now h1{margin:0;font:900 clamp(48px,8vw,92px)/1 Arial,sans-serif}.wc-call-now .thanks{margin:10px 0 30px;font:700 clamp(20px,3vw,30px)/1.3 Georgia,serif}.wc-call-now strong{display:inline-block;background:#ffd43b;color:#111827;padding:8px 16px;border-radius:999px;font:800 15px/1.2 Arial,sans-serif;letter-spacing:.08em}.wc-call-now h2{margin:22px 0 8px;font:900 clamp(30px,5vw,58px)/1.05 Arial,sans-serif;text-transform:uppercase}.wc-call-now a{display:inline-block;margin:10px 0;padding:18px 30px;border-radius:14px;color:#fff!important;text-decoration:none;font:900 clamp(28px,5vw,60px)/1 Arial,sans-serif}.wc-call-now .phone{background:#22c55e;box-shadow:0 8px 0 #147a38,0 14px 30px #0005}.wc-call-now .or{margin:28px auto 12px;font:900 25px/1 Arial,sans-serif}.wc-call-now .schedule{background:#7c3aed;box-shadow:0 8px 0 #4c1d95,0 14px 30px #0005}.wc-call-now p{margin:22px 0 0;font:700 20px/1.4 Arial,sans-serif}@media(max-width:600px){.wc-call-now{padding:28px 12px}.wc-call-now a{padding:16px 14px;width:100%}}';
      document.head.appendChild(style);
    }
    ensureCallout();
    addEventListener('load', ensureCallout, { once:true });
    setTimeout(ensureCallout, 500);
    setTimeout(ensureCallout, 2000);
    new MutationObserver(ensureCallout).observe(document.body, { childList:true });
    document.querySelectorAll('a[href*="perpetualincome365.convertri.com/7figure-everwebinar-registration"]').forEach(link=>{link.href='/webinar'});
  }
  const params = new URLSearchParams(location.search);
  const attribution = Object.fromEntries(['aid','tid','utm_source','utm_campaign'].map(key => [key, params.get(key) || localStorage.getItem(`cta_${key}`) || '']));
  Object.entries(attribution).forEach(([key,value]) => value && localStorage.setItem(`cta_${key}`, value));
  let sessionId=sessionStorage.getItem('cta_session_id');if(!sessionId){sessionId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;sessionStorage.setItem('cta_session_id',sessionId)}
  const device=innerWidth<768?'Mobile':innerWidth<1100?'Tablet':'Desktop',context={...attribution,session_id:sessionId,device};
  const send = (url, data) => fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(data), keepalive:true }).catch(()=>{});
  send('/api/events', { type:'page_view', page:location.pathname, ...context });
  if(location.pathname==='/checkout'){let started=false;document.addEventListener('focusin',event=>{if(!started&&event.target.matches('input,select')){started=true;send('/api/events',{type:'checkout_start',page:location.pathname,...context})}},true)}
  document.querySelectorAll('video').forEach(video=>{const fired=new Set();const fire=type=>{if(fired.has(type))return;fired.add(type);send('/api/events',{type,page:location.pathname,...context})};video.addEventListener('volumechange',()=>{if(!video.muted&&video.volume>0)fire('video_unmute')});video.addEventListener('timeupdate',()=>{if(!video.duration)return;const progress=video.currentTime/video.duration;if(progress>=.25)fire('video_25');if(progress>=.5)fire('video_50');if(progress>=.75)fire('video_75');if(progress>=.98)fire('video_100')})});
  document.addEventListener('submit', event => {
    const form = event.target;
    const data = Object.fromEntries(new FormData(form));
    const email = data.email || data.Email || form.querySelector('input[type=email]')?.value;
    const phone = data.phone || data.Phone || form.querySelector('input[type=tel]')?.value;
    if (!email && !phone) return;
    send('/api/leads', { ...data, email, phone, email_consent:Boolean(data.email_consent || form.querySelector('[name*=email_consent]:checked')),
      sms_consent:Boolean(data.sms_consent || form.querySelector('[name*=sms_consent]:checked')), landing_page:location.pathname, ...attribution });
  }, true);
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href*="jvzoo.com"],a[href*="/b/"]');
    if (!link) return;
    send('/api/events', { type:'checkout_click', page:location.pathname, product_id:link.href, ...context });
    const oto = location.pathname.match(/^\/oto([1-7])\/?$/);
    if (!oto) {
      event.preventDefault();
      location.href = '/checkout?product=front';
      return;
    }
    event.preventDefault();
    const discounted = new URL(link.href, location.href).searchParams.has('coupon');
    const product = `oto${oto[1]}${discounted ? '_downsell' : ''}`;
    const label = link.textContent;
    link.style.pointerEvents = 'none';
    link.textContent = 'Processing…';
    fetch('/api/purchase', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({product}) })
      .then(async response => { const data=await response.json(); if(!response.ok)throw Error(data.error||'Purchase failed'); location.href=data.next; })
      .catch(error => { link.style.pointerEvents=''; link.textContent=label; alert(error.message); });
  }, true);
})();
