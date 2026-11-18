(function(){
  'use strict';
  const EMAIL_KEY='userEmail';let clientId='',initialized=false,attempts=0,timer=null;
  const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim()),readStored=()=>{try{return sessionStorage.getItem(EMAIL_KEY)||''}catch{return ''}},store=email=>{try{sessionStorage.setItem(EMAIL_KEY,email)}catch{}};
  function initialize(email){if(initialized||!clientId||!validEmail(email))return false;if(!window.AFFRAUDDEFLECT||typeof window.AFFRAUDDEFLECT.init!=='function')return false;window.AFFRAUDDEFLECT.init({team:clientId,userId:email,serverUrl:'https://session.frauddeflect.net'});initialized=true;if(timer)clearInterval(timer);return true}
  function emailInput(){return document.querySelector('#email,input[name="emailAddress"],input[name="email"],input[type="email"]')}
  function capture(value){const email=String(value||emailInput()?.value||'').trim().toLowerCase();if(!validEmail(email))return false;store(email);initialize(email);return true}
  function retry(){const email=readStored()||emailInput()?.value||'';if(initialize(email)||++attempts>=120){if(timer)clearInterval(timer)}}
  function loadVendor(){if(!clientId||document.getElementById('fraud-deflect-session'))return;const script=document.createElement('script');script.id='fraud-deflect-session';script.async=true;script.charset='utf-8';script.src=`https://session.frauddeflect.net/static/v4.${encodeURIComponent(clientId)}.js`;script.addEventListener('load',retry);document.head.appendChild(script)}
  window.FDIDCaptureEmail=capture;document.addEventListener('input',event=>{if(event.target?.matches?.('#email,input[name="emailAddress"],input[name="email"],input[type="email"]'))capture(event.target.value)},true);document.addEventListener('change',event=>{if(event.target?.matches?.('#email,input[name="emailAddress"],input[name="email"],input[type="email"]'))capture(event.target.value)},true);document.addEventListener('submit',()=>capture(),true);document.addEventListener('click',event=>{if(event.target?.closest?.('button,.checkoutButton,[data-purchase],a[href*="ocu=yes"]'))capture()},true);
  fetch('/api/fdid/config',{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject()).then(config=>{clientId=String(config.clientId||'').trim();if(!clientId)return;loadVendor();retry();timer=setInterval(retry,250)}).catch(()=>{});
})();
