/**
 * Client engagement beacon for demo.voygent.ai. A tiny, dependency-free inline
 * script embedded in every demo page (SPA shell + Worker-rendered info/blog/
 * showcase). Captures an anonymous first-party visitor id (localStorage), a
 * `view` on load, `engage` (max scroll + dwell) on pagehide, and `cta` on
 * [data-cta] / outbound-link clicks, and posts them CROSS-ORIGIN to
 * https://voygent.ai/api/pv so demo data lands in the same web_events store as
 * voygent.ai (unified funnels). Adopts an incoming ?_vid= and decorates links
 * to voygent.ai with ?_vid= so demo→signup journeys stitch across the domains.
 *
 * This is a byte-for-byte copy of the voygent-lite beacon body (voygent-lite
 * src/analytics/beacon-snippet.ts), pre-configured for the demo site. Keep the
 * two in sync if the beacon logic changes.
 *
 * Fails silent, never blocks paint, no external request except the beacon POST.
 */

// site="demo", endpoint="https://voygent.ai/api/pv", sibling="voygent.ai".
export const BEACON_TAG = `<script>(function(){try{
var SITE="demo",EP="https://voygent.ai/api/pv",SIB="voygent.ai";
var qs=new URLSearchParams(location.search);
var vid=null;try{vid=localStorage.getItem('vg_vid');}catch(e){}
var inc=qs.get('_vid');if(inc&&/^[A-Za-z0-9_-]{6,64}$/.test(inc)){vid=inc;}
if(!vid){vid=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+'-'+Math.random().toString(36).slice(2));}
try{localStorage.setItem('vg_vid',vid);}catch(e){}
var reel=qs.get('reel');
var path=location.pathname+(reel?'?reel='+reel:'');
var t0=Date.now(),maxScroll=0,sent=false;
function post(events){try{var b=JSON.stringify({vid:vid,site:SITE,path:path,events:events});
if(navigator.sendBeacon){navigator.sendBeacon(EP,new Blob([b],{type:'application/json'}));}
else{fetch(EP,{method:'POST',body:b,headers:{'Content-Type':'application/json'},keepalive:true,mode:'cors'});}}catch(e){}}
post([{kind:'view'}]);
function onScroll(){try{var h=document.documentElement,d=h.scrollHeight-h.clientHeight;
var p=d>0?Math.round((window.pageYOffset||h.scrollTop)/d*100):100;if(p>maxScroll)maxScroll=Math.min(100,Math.max(0,p));}catch(e){}}
window.addEventListener('scroll',onScroll,{passive:true});
function flush(){if(sent)return;sent=true;post([{kind:'engage',scroll_pct:maxScroll,dwell_ms:Date.now()-t0}]);}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flush();});
window.addEventListener('pagehide',flush);
document.addEventListener('click',function(ev){try{var el=ev.target;
while(el&&el!==document.body){
if(el.getAttribute){var dc=el.getAttribute('data-cta');if(dc){post([{kind:'cta',cta:String(dc).slice(0,80)}]);break;}}
if(el.tagName==='A'&&el.href){var host='';try{host=new URL(el.href).host;}catch(e){}
if(SIB&&host===SIB){try{var u=new URL(el.href);if(!u.searchParams.get('_vid')){u.searchParams.set('_vid',vid);el.href=u.toString();}}catch(e){}}
if(host&&host!==location.host){post([{kind:'cta',cta:'out:'+host.slice(0,74)}]);}break;}
el=el.parentNode;}}catch(e){}},true);
}catch(e){}})();</script>`;

const BEACON_MARKER = "localStorage.getItem('vg_vid')";

/** Inject the demo beacon just before </body> (fallback </html>, then append).
 *  Idempotent — skips if the beacon is already present. */
export function injectBeacon(html: string): string {
  if (html.includes(BEACON_MARKER)) return html;
  const lower = html.toLowerCase();
  const idx = lower.lastIndexOf("</body>");
  if (idx !== -1) return html.slice(0, idx) + BEACON_TAG + html.slice(idx);
  const h = lower.lastIndexOf("</html>");
  if (h !== -1) return html.slice(0, h) + BEACON_TAG + html.slice(h);
  return html + BEACON_TAG;
}
