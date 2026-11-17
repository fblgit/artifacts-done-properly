(function(){var B={};document.querySelectorAll('script[data-adp-file]').forEach(function(s){B[s.getAttribute('data-adp-file')]=s});
function raw(p){var s=B[p];if(!s)throw new Error('adp-pack: no file '+p);if(s.dataset.enc==='utf8')return new TextEncoder().encode(s.textContent);var b=atob(s.textContent),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
function text(p){var s=B[p];return s.dataset.enc==='utf8'?s.textContent:new TextDecoder().decode(raw(p))}
function put(tag,p,t){var e=document.createElement(tag);e.textContent=t;var c=document.currentScript;c.parentNode.insertBefore(e,c)}
window.ADPPACK={files:B,css:function(p){put('style',p,text(p))},js:function(p){put('script',p,text(p)+'\n//# sourceURL='+p)}};
var f=window.fetch,base=new URL('.',document.baseURI).href;
window.fetch=function(u,o){var a=String(u&&u.url||u),m=((o&&o.method)||(u&&u.method)||'GET').toUpperCase();
 try{a=new URL(a,document.baseURI).href}catch(e){}
 var p=a.indexOf(base)===0?a.slice(base.length).split(/[?#]/)[0]:null;
 if(p&&B[p]&&(m==='GET'||m==='HEAD'))return Promise.resolve(new Response(m==='HEAD'?null:raw(p),{status:200,headers:{'content-type':B[p].dataset.type}}));
 return f.apply(this,arguments)}})()
