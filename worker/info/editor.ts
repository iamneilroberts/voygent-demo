// Admin-only in-place editor injected into /info pages. Inert without a stored
// admin key (the server enforces ADMIN_TOKEN on every save/revert) — so shipping
// this to public page source is safe. Visibility is client-gated: the toolbar
// shows only when a key is in localStorage or the URL carries ?edit=1.
//
// Returns a self-contained HTML string (style + toolbar + script). No backticks
// or ${} inside the injected <script> — it's a static blob with two values
// (slug, edited) interpolated from the TS template below.

function jsStr(s: string): string {
  return JSON.stringify(s);
}

export function editorChrome(slug: string, edited: boolean): string {
  const SLUG = jsStr(slug);
  const EDITED = edited ? "true" : "false";
  return `
<style>
  #info-editbar { position: fixed; top: 10px; right: 12px; z-index: 9999; display: none;
    gap: 6px; align-items: center; background: #14110b; border: 1px solid #2a2316;
    border-radius: 999px; padding: 6px 10px; font: 600 .8125rem/1 ui-monospace, monospace;
    box-shadow: 0 4px 18px rgba(0,0,0,.5); }
  #info-editbar button { font: inherit; cursor: pointer; color: #f5a623; background: transparent;
    border: 1px solid #2a2316; border-radius: 999px; padding: 5px 10px; }
  #info-editbar button:hover { background: #f5a623; color: #0c0a07; }
  #info-editbar .ie-chip { color: #9a907c; padding: 0 4px; }
  #info-editbar .ie-chip.ie-on { color: #3fb950; }
  .ie-editing { outline: 1px dashed #f5a623; outline-offset: 4px; border-radius: 4px; }
  #info-title.ie-editing, #info-subtitle.ie-editing { outline-offset: 2px; }
  textarea.ie-raw { width: 100%; min-height: 60vh; background: #0c0a07; color: #efe7d6;
    border: 1px solid #2a2316; border-radius: 6px; padding: 12px;
    font: 500 .8125rem/1.6 ui-monospace, monospace; }
</style>
<div id="info-editbar" role="toolbar" aria-label="Page editor">
  <span class="ie-chip" id="ie-chip">source default</span>
  <button id="ie-edit" type="button">Edit</button>
  <button id="ie-html" type="button" style="display:none">&lt;/&gt; HTML</button>
  <button id="ie-save" type="button" style="display:none">Save</button>
  <button id="ie-cancel" type="button" style="display:none">Cancel</button>
  <button id="ie-revert" type="button">Revert</button>
</div>
<script>
(function(){
  var SLUG = ${SLUG};
  var EDITED = ${EDITED};
  var KEY_LS = "voygentInfoAdminKey";
  var qs = new URLSearchParams(location.search);
  function getKey(){ return localStorage.getItem(KEY_LS) || ""; }
  function ensureKey(){
    var k = getKey();
    if(!k){ k = (prompt("Admin key (ADMIN_TOKEN):") || "").trim(); if(k) localStorage.setItem(KEY_LS, k); }
    return k;
  }
  var hasEntry = !!getKey() || qs.has("edit");
  var bar = document.getElementById("info-editbar");
  if(!bar || !hasEntry) return;
  bar.style.display = "flex";

  var titleEl = document.getElementById("info-title");
  var subEl = document.getElementById("info-subtitle");
  var bodyEl = document.getElementById("info-body");
  var chip = document.getElementById("ie-chip");
  var btnEdit = document.getElementById("ie-edit");
  var btnHtml = document.getElementById("ie-html");
  var btnSave = document.getElementById("ie-save");
  var btnCancel = document.getElementById("ie-cancel");
  var btnRevert = document.getElementById("ie-revert");

  if(EDITED){ chip.textContent = "overridden ✎"; chip.classList.add("ie-on"); }

  var editing = false, rawMode = false, ta = null;
  var savedTitle = "", savedSub = "", savedBody = "";

  function editables(){ return [titleEl, subEl, bodyEl].filter(Boolean); }
  function setEditable(on){
    editables().forEach(function(el){
      el.contentEditable = on ? "true" : "false";
      el.classList.toggle("ie-editing", on);
    });
  }
  function showEditing(on){
    btnEdit.style.display = on ? "none" : "";
    btnHtml.style.display = on ? "" : "none";
    btnSave.style.display = on ? "" : "none";
    btnCancel.style.display = on ? "" : "none";
  }
  function startEdit(){
    if(!ensureKey()) return;
    editing = true;
    savedTitle = titleEl ? titleEl.innerText : "";
    savedSub = subEl ? subEl.innerText : "";
    savedBody = bodyEl ? bodyEl.innerHTML : "";
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch(e){}
    setEditable(true);
    showEditing(true);
    if(titleEl) titleEl.focus();
  }
  function exitEdit(){
    if(rawMode) toggleRaw();
    editing = false;
    setEditable(false);
    showEditing(false);
  }
  function cancel(){
    if(rawMode) toggleRaw();
    if(titleEl) titleEl.innerText = savedTitle;
    if(subEl) subEl.innerText = savedSub;
    if(bodyEl) bodyEl.innerHTML = savedBody;
    exitEdit();
  }
  function toggleRaw(){
    if(!bodyEl) return;
    if(!rawMode){
      ta = document.createElement("textarea");
      ta.className = "ie-raw";
      ta.value = bodyEl.innerHTML;
      bodyEl.style.display = "none";
      bodyEl.parentNode.insertBefore(ta, bodyEl.nextSibling);
      rawMode = true;
      btnHtml.innerHTML = "WYSIWYG";
    } else {
      bodyEl.innerHTML = ta.value;
      ta.parentNode.removeChild(ta);
      ta = null;
      bodyEl.style.display = "";
      rawMode = false;
      btnHtml.innerHTML = "&lt;/&gt; HTML";
    }
  }
  function currentBody(){ return (rawMode && ta) ? ta.value : (bodyEl ? bodyEl.innerHTML : ""); }

  document.addEventListener("paste", function(e){
    if(!editing) return;
    e.preventDefault();
    var t = ((e.clipboardData || window.clipboardData).getData("text/plain")) || "";
    document.execCommand("insertText", false, t);
  });

  function postJson(path, payload, onOk){
    var k = ensureKey(); if(!k) return;
    fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + k },
      body: JSON.stringify(payload || {})
    }).then(function(r){
      if(r.status === 401){ localStorage.removeItem(KEY_LS); alert("Auth rejected — re-enter the admin key."); resetButtons(); return; }
      if(!r.ok){ throw new Error("request failed (" + r.status + ")"); }
      onOk();
    }).catch(function(err){ alert(String(err)); resetButtons(); });
  }
  function resetButtons(){ btnSave.disabled = false; btnSave.innerHTML = "Save"; }
  function reloadClean(){ location.href = location.pathname; }

  function save(){
    btnSave.disabled = true; btnSave.innerHTML = "Saving…";
    postJson("/info/" + encodeURIComponent(SLUG) + "/save", {
      title: titleEl ? titleEl.innerText.trim() : "",
      subtitle: subEl ? subEl.innerText.trim() : "",
      body: currentBody()
    }, reloadClean);
  }
  function revert(){
    if(!confirm("Revert this page to the source default? Saved edits will be deleted.")) return;
    postJson("/info/" + encodeURIComponent(SLUG) + "/revert", {}, reloadClean);
  }

  btnEdit.addEventListener("click", startEdit);
  btnHtml.addEventListener("click", toggleRaw);
  btnSave.addEventListener("click", save);
  btnCancel.addEventListener("click", cancel);
  btnRevert.addEventListener("click", revert);
})();
</script>`;
}
