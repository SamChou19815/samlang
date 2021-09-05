// @generated
/* eslint-disable */
//prettier-ignore
module.exports = {
name: "@yarnpkg/plugin-monorail",
factory: function (require) {
var plugin=(()=>{var M=Object.create;var u=Object.defineProperty,q=Object.defineProperties,U=Object.getOwnPropertyDescriptor,V=Object.getOwnPropertyDescriptors,z=Object.getOwnPropertyNames,y=Object.getOwnPropertySymbols,K=Object.getPrototypeOf,x=Object.prototype.hasOwnProperty,I=Object.prototype.propertyIsEnumerable;var T=(e,n,r)=>n in e?u(e,n,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[n]=r,h=(e,n)=>{for(var r in n||(n={}))x.call(n,r)&&T(e,r,n[r]);if(y)for(var r of y(n))I.call(n,r)&&T(e,r,n[r]);return e},F=(e,n)=>q(e,V(n)),P=e=>u(e,"__esModule",{value:!0});var p=e=>{if(typeof require!="undefined")return require(e);throw new Error('Dynamic require of "'+e+'" is not supported')};var b=(e,n)=>{var r={};for(var o in e)x.call(e,o)&&n.indexOf(o)<0&&(r[o]=e[o]);if(e!=null&&y)for(var o of y(e))n.indexOf(o)<0&&I.call(e,o)&&(r[o]=e[o]);return r};var X=(e,n)=>{P(e);for(var r in n)u(e,r,{get:n[r],enumerable:!0})},Z=(e,n,r)=>{if(n&&typeof n=="object"||typeof n=="function")for(let o of z(n))!x.call(e,o)&&o!=="default"&&u(e,o,{get:()=>n[o],enumerable:!(r=U(n,o))||r.enumerable});return e},d=e=>Z(P(u(e!=null?M(K(e)):{},"default",e&&e.__esModule&&"default"in e?{get:()=>e.default,enumerable:!0}:{value:e,enumerable:!0})),e);var ie={};X(ie,{default:()=>se});var B=d(p("fs")),C=d(p("clipanion"));var _=d(p("child_process"));var l=e=>process.stderr.isTTY?n=>`[${e}m${n}[0m`:n=>n,v=l(31),$=l(32),L=l(33),R=l(34),A=l(35),ce=l(36);var Q=["\u280B","\u2819","\u2839","\u2838","\u283C","\u2834","\u2826","\u2827","\u2807","\u280F"];async function S(e,n){if(!process.stderr.isTTY)return n();let r=0,o=new Date().getTime(),t=setInterval(()=>{let i=`${((new Date().getTime()-o)/1e3).toFixed(1)}s`,s=e(i),c=Q[r%10];process.stderr.write(L(`${s} ${c}\r`)),r+=1},process.stderr.isTTY?40:1e3),a=await n();return clearInterval(t),a}var O=d(p("child_process")),w=d(p("path"));var D=d(p("fs"));function J(e){return e.scope==null?e.name:`@${e.scope}/${e.name}`}function ee(e){let n=new Map;return e.workspaces.forEach(r=>{let o=r.relativeCwd;if(o===".")return;let t=J(r.locator),a=Array.from(r.getRecursiveWorkspaceDependencies()).map(i=>J(i.locator));n.set(t,{workspaceLocation:o,dependencies:a})}),n}function j(e,n){let r=[],o=[],t=new Set,a=new Set;function i(s){var m;if(a.has(s)){if(!t.has(s))return;o.push(s);let g=o.indexOf(s),H=o.slice(g,o.length).join(" -> ");throw new Error(`Cyclic dependency detected: ${H}`)}let c=(m=e.get(s))==null?void 0:m.dependencies;if(c==null)throw new Error(`Workspace ${n} is not found!`);a.add(s),o.push(s),t.add(s),c.forEach(i),t.delete(s),o.pop(),r.push(s)}return i(n),r}function N(e){let n=ee(e);return{__type__:"@generated",information:Object.fromEntries(Array.from(n.entries()).map(a=>{var[r,i]=a,s=i,{dependencies:o}=s,t=b(s,["dependencies"]);return[r,F(h({},t),{dependencyChain:j(n,r)})]}).sort(([r],[o])=>r.localeCompare(o))),topologicallyOrdered:(()=>{let r=[],o=new Set;return Array.from(n.keys()).forEach(t=>{j(n,t).forEach(i=>{o.has(i)||(r.push(i),o.add(i))})}),r})()}}function k(){return new Promise((e,n)=>(0,D.readFile)("workspaces.json",(r,o)=>r?n(r):e(JSON.parse(o.toString()))))}function ne(e){function n(r,o){let t=(0,O.spawnSync)("git",["diff",r,...o?[o]:[],"--name-only","--",e]).stdout.toString().trim();return t===""?[]:t.split(`
`)}return process.env.CI?n("HEAD^","HEAD"):n("origin/main")}function re(e,n){var t,a;let r=i=>{var s,c;return(0,w.dirname)(i)!==(0,w.join)((c=(s=e.information[n])==null?void 0:s.workspaceLocation)!=null?c:".","bin")};return((a=(t=e.information[n])==null?void 0:t.dependencyChain)!=null?a:[]).some(i=>{var m,g;let s=(g=(m=e.information[i])==null?void 0:m.workspaceLocation)!=null?g:".";return ne(s).some(r)})}async function f(){let e=await k();return e.topologicallyOrdered.map(n=>{let r=re(e,n);return[n,r]}).filter(([,n])=>n).map(([n])=>h({name:n},e.information[n]))}var oe=async()=>{let e=await f();e.forEach(({name:t})=>{console.error(R(`[i] \`${t}\` needs to be recompiled.`))});let n=await S(t=>`[?] Compiling (${t})`,()=>Promise.all(e.map(({name:t})=>{let a=(0,_.spawn)("yarn",["workspace",t,"compile"],{shell:!0,stdio:["ignore","pipe","ignore"]}),i="";return a.stdout.on("data",s=>{i+=s.toString()}),new Promise(s=>{a.on("exit",c=>s([t,c===0,i]))})}))),r=n.map(t=>t[2]).join(""),o=n.filter(t=>!t[1]).map(t=>t[0]);return o.length===0?(console.error($("[\u2713] All workspaces have been successfully compiled!")),!0):(console.error(A("[!] Compilation finished with some errors.")),console.error(r.trim()),o.forEach(t=>{console.error(v(`[x] \`${t}\` failed to exit with 0.`))}),!1)},G=oe;var W=class extends C.Command{async execute(){return await G()?0:1}};W.paths=[["c"]];var Y=class extends C.Command{async execute(){try{let n=await k();return this.context.stdout.write(`${JSON.stringify(n,void 0,2)}
`),0}catch{return 1}}};Y.paths=[["q"],["query"]];var E=class extends C.Command{async execute(){return this.context.stdout.write(`${JSON.stringify(await f(),void 0,2)}
`),0}};E.paths=[["t"],["targets"]];var te={hooks:{afterAllInstalled(e){(0,B.writeFileSync)("workspaces.json",`${JSON.stringify(N(e),void 0,2)}
`)}},commands:[W,Y,E]},se=te;return ie;})();
return plugin;
}
};
