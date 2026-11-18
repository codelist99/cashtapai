(()=>{
  const byId=id=>document.getElementById(id),form=byId('paymentForm'),button=byId('checkoutButton'),errorBox=byId('paymentError'),query=new URLSearchParams(location.search);
  let processing=false,config;
  const fail=message=>{processing=false;errorBox.textContent=message;button.disabled=false;button.textContent='COMPLETE SECURE ORDER — $17.00'};
  form.addEventListener('submit',event=>{
    event.preventDefault();if(processing||!config)return;
    processing=true;errorBox.textContent='';button.disabled=true;button.textContent='SECURELY PROCESSING…';
    const cardData={cardNumber:byId('cardNumber').value.replace(/\D/g,''),month:byId('expMonth').value,year:byId('expYear').value,cardCode:byId('cardCode').value,zip:byId('zip').value,fullName:byId('cardName').value};
    Accept.dispatchData({authData:{apiLoginID:config.apiLoginId,clientKey:config.publicClientKey},cardData},async response=>{
      if(response.messages.resultCode==='Error')return fail(response.messages.message.map(item=>item.text).join(' '));
      try{
        const payload={opaqueData:response.opaqueData,consent:byId('consent').checked,first_name:byId('firstName').value,last_name:byId('lastName').value,email:byId('email').value,phone:byId('phone').value,address:byId('address').value,city:byId('city').value,state:byId('state').value,zip:byId('zip').value,country:'US'};
        window.FDIDCaptureEmail?.(payload.email);
        const result=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),data=await result.json();
        if(!result.ok)throw new Error(data.error||'Payment could not be completed');
        location.href=query.toString()?`${data.next}?${query}`:data.next;
      }catch(error){fail(error.message)}
    });
  });
  byId('cardNumber').addEventListener('input',event=>{event.target.value=event.target.value.replace(/\D/g,'').replace(/(.{4})/g,'$1 ').trim()});
  fetch('/api/checkout/config').then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Checkout unavailable');return data}).then(data=>{
    config=data;if(!config.apiLoginId||!config.publicClientKey)throw new Error('Secure checkout is not configured');
    const script=document.createElement('script');script.src=config.environment==='sandbox'?'https://jstest.authorize.net/v1/Accept.js':'https://js.authorize.net/v1/Accept.js';script.charset='utf-8';script.onload=()=>{button.disabled=false;button.textContent='COMPLETE SECURE ORDER — $17.00'};script.onerror=()=>fail('Secure payment fields could not load. Refresh and try again.');document.head.appendChild(script);
  }).catch(error=>fail(error.message));
})();
