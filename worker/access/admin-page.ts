// Self-contained admin console. No build step, no React — a single HTML string the
// Worker serves at GET /admin (behind Cloudflare Access). Talks to /admin/codes.
export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voygent Demo — Admin</title>
<style>
 body{font:14px system-ui,sans-serif;max-width:880px;margin:2rem auto;padding:0 1rem;color:#111}
 h1{font-size:1.2rem} form{display:grid;grid-template-columns:repeat(6,1fr);gap:.5rem;align-items:end;margin:1rem 0}
 label{display:flex;flex-direction:column;font-size:.75rem;gap:.2rem} input{padding:.4rem;border:1px solid #ccc;border-radius:6px}
 button{padding:.45rem .7rem;border:0;border-radius:6px;background:#2b6;color:#fff;cursor:pointer}
 table{width:100%;border-collapse:collapse;margin-top:1rem} td,th{padding:.4rem;border-bottom:1px solid #eee;text-align:left;font-size:.8rem}
 .bar{height:6px;background:#eee;border-radius:3px;overflow:hidden} .bar>i{display:block;height:100%;background:#2b6}
 .link{font-family:monospace;font-size:.72rem;word-break:break-all} .revoked{opacity:.45}
 .new{background:#efe;padding:.6rem;border-radius:6px;margin:.5rem 0;font-family:monospace;font-size:.78rem;display:none}
</style></head><body>
<h1>Voygent Demo — Admin</h1>
<div class="new" id="new"></div>
<form id="f">
 <label>id<input name="id" required placeholder="acme-partner"></label>
 <label>label<input name="label" required placeholder="Acme partner"></label>
 <label>view<input name="view" value="default"></label>
 <label>daily $<input name="dailyUsd" type="number" step="0.01" value="5" required></label>
 <label>total $<input name="totalUsd" type="number" step="0.01" value="25" required></label>
 <button>Mint</button>
</form>
<table id="t"><thead><tr><th>code</th><th>view</th><th>daily</th><th>lifetime</th><th>expires</th><th></th></tr></thead><tbody></tbody></table>
<script>
const fmt = m => '$' + (m/1e6).toFixed(2);
async function load(){
 const r = await fetch('/admin/codes'); const {codes} = await r.json();
 const tb = document.querySelector('#t tbody'); tb.innerHTML='';
 for(const c of codes){
   const dpct = Math.min(100, c.daily_micros? (c.day_spent/c.daily_micros*100):0);
   const lpct = Math.min(100, c.total_micros? (c.lifetime_spent/c.total_micros*100):0);
   const tr = document.createElement('tr'); if(c.revoked) tr.className='revoked';
   tr.innerHTML = '<td><b>'+c.id+'</b><br><span style="color:#888">'+c.label+'</span></td>'
     +'<td>'+c.view+'</td>'
     +'<td>'+fmt(c.day_spent)+' / '+fmt(c.daily_micros)+'<div class=bar><i style="width:'+dpct+'%"></i></div></td>'
     +'<td>'+fmt(c.lifetime_spent)+' / '+fmt(c.total_micros)+'<div class=bar><i style="width:'+lpct+'%"></i></div></td>'
     +'<td>'+(c.expires_at||'—')+'</td>'
     +'<td>'+(c.revoked?'revoked':'<button data-id="'+c.id+'">revoke</button>')+'</td>';
   tb.appendChild(tr);
 }
 tb.querySelectorAll('button[data-id]').forEach(b=>b.onclick=async()=>{
   await fetch('/admin/codes/'+encodeURIComponent(b.dataset.id)+'/revoke',{method:'POST',headers:{'content-type':'application/json'}}); load();
 });
}
document.querySelector('#f').onsubmit = async e => {
 e.preventDefault(); const d=Object.fromEntries(new FormData(e.target));
 d.dailyUsd=+d.dailyUsd; d.totalUsd=+d.totalUsd;
 const r = await fetch('/admin/codes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
 const j = await r.json();
 if(j.link){ const n=document.querySelector('#new'); n.style.display='block'; n.textContent='Invite link (copy now): '+j.link; e.target.reset(); load(); }
 else alert('error: '+JSON.stringify(j));
};
load();
</script></body></html>`;
