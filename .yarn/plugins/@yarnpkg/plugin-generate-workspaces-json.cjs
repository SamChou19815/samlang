/* eslint-disable */
module.exports = {
name: "@yarnpkg/plugin-generate-workspaces-json",
factory: function (require) {
var plugin;plugin=(()=>{"use strict";var e={360:(e,r,n)=>{n.r(r),n.d(r,{default:()=>t});var o=n(747);const t={hooks:{afterAllInstalled:()=>{(0,o.writeFileSync)("workspaces.json",JSON.stringify(n(547).Z,void 0,2)+"\n")}},commands:[]}},547:(e,r,n)=>{n.d(r,{Z:()=>a});var o=n(129);const t=(()=>{const e=new Map,r=`[${(0,o.spawnSync)("yarn",["workspaces","list","-v","--json"]).stdout.toString().trim().split("\n").join(",")}]`,n=JSON.parse(r),t={};return n.forEach(({name:e,location:r})=>{null!=e&&(t[r]=e)}),n.forEach(({name:r,location:n,workspaceDependencies:o})=>{null!=r&&e.set(r,{workspaceLocation:n,dependencies:o.map(e=>{const r=t[e];if(null==r)throw new Error(`Bad dependency of ${r}: ${e}`);return r})})}),e})(),s=e=>{const r=[],n=[],o=new Set,s=new Set,a=d=>{var i;if(s.has(d)){if(!o.has(d))return;n.push(d);const e=n.indexOf(d),r=n.slice(e,n.length).join(" -> ");throw new Error("Cyclic dependency detected: "+r)}const c=null===(i=t.get(d))||void 0===i?void 0:i.dependencies;if(null==c)throw new Error(`Workspace ${e} is not found!`);s.add(d),n.push(d),o.add(d),c.forEach(a),o.delete(d),n.pop(),r.push(d)};return a(e),r},a={__type__:"@generated",information:Object.fromEntries(Array.from(t.entries()).map(([e,{dependencies:r,...n}])=>[e,{...n,dependencyChain:s(e)}]).sort(([e],[r])=>e.localeCompare(r))),topologicallyOrdered:(()=>{const e=[],r=new Set;return Array.from(t.keys()).forEach(n=>{s(n).forEach(n=>{r.has(n)||(e.push(n),r.add(n))})}),e})()}},129:e=>{e.exports=require("child_process")},747:e=>{e.exports=require("fs")}},r={};function n(o){if(r[o])return r[o].exports;var t=r[o]={exports:{}};return e[o](t,t.exports,n),t.exports}return n.n=e=>{var r=e&&e.__esModule?()=>e.default:()=>e;return n.d(r,{a:r}),r},n.d=(e,r)=>{for(var o in r)n.o(r,o)&&!n.o(e,o)&&Object.defineProperty(e,o,{enumerable:!0,get:r[o]})},n.o=(e,r)=>Object.prototype.hasOwnProperty.call(e,r),n.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},n(360)})();
return plugin;
}
};