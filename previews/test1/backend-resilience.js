// Keep optional backend features bounded and independent of the invitation UI.
const scripts=new Map(),clients=new Map();
const timeoutError=()=>Object.assign(new Error('BACKEND_TIMEOUT'),{code:'BACKEND_TIMEOUT'});
export function withTimeout(task,milliseconds=20000){
  let timer;
  const work=Promise.resolve().then(()=>typeof task==='function'?task():task);
  return Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(timeoutError()),milliseconds);})]).finally(()=>clearTimeout(timer));
}
export function isServiceUnavailable(error){
  const status=Number(error?.status||error?.statusCode),message=String(error?.code||'')+' '+String(error?.message||'');
  return status===402||status===429||status>=500||/BACKEND_|quota|usage.?limit|over_request|rate.?limit|paused|restricted|fetch|network|timeout|timed out/i.test(message)||['AbortError','TimeoutError'].includes(error?.name);
}
export function loadBackendScript(src,milliseconds=15000){
  if(!scripts.has(src)){
    const promise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');let timer;
      const finish=error=>{clearTimeout(timer);script.onload=null;script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
      script.src=src;script.onload=()=>finish();script.onerror=()=>finish(new Error('BACKEND_SCRIPT_UNAVAILABLE'));
      timer=setTimeout(()=>finish(timeoutError()),milliseconds);document.head.append(script);
    }).catch(error=>{scripts.delete(src);throw error;});
    scripts.set(src,promise);
  }
  return scripts.get(src);
}
export function createTimedFetch(milliseconds=30000,fetchImpl=globalThis.fetch){
  return async(input,options={})=>{
    const controller=new AbortController(),abort=()=>controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted)abort();
    const timer=setTimeout(()=>controller.abort(timeoutError()),milliseconds);
    try{return await fetchImpl(input,{...options,signal:controller.signal});}
    finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
  };
}
export function getBackendClient(config,sdkUrl){
  const key=config.projectUrl+'|'+config.publishableKey;
  if(!clients.has(key)){
    clients.set(key,(async()=>{
      if(!window.supabase)await loadBackendScript(sdkUrl);
      if(!window.supabase?.createClient)throw new Error('BACKEND_SDK_UNAVAILABLE');
      return window.supabase.createClient(config.projectUrl,config.publishableKey,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'wedding-'+new URL(config.projectUrl).hostname},
        global:{fetch:createTimedFetch()}
      });
    })().catch(error=>{clients.delete(key);throw error;}));
  }
  return clients.get(key);
}
