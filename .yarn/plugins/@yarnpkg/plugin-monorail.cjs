/* eslint-disable */
//prettier-ignore
module.exports = {
name: "@yarnpkg/plugin-monorail",
factory: function (require) {
var plugin=(()=>{var U=Object.create,f=Object.defineProperty,K=Object.defineProperties,V=Object.getOwnPropertyDescriptor,z=Object.getOwnPropertyDescriptors,Q=Object.getOwnPropertyNames,h=Object.getOwnPropertySymbols,X=Object.getPrototypeOf,C=Object.prototype.hasOwnProperty,W=Object.prototype.propertyIsEnumerable;var F=(n,e,r)=>e in n?f(n,e,{enumerable:!0,configurable:!0,writable:!0,value:r}):n[e]=r,T=(n,e)=>{for(var r in e||(e={}))C.call(e,r)&&F(n,r,e[r]);if(h)for(var r of h(e))W.call(e,r)&&F(n,r,e[r]);return n},Y=(n,e)=>K(n,z(e)),Z=n=>f(n,"__esModule",{value:!0});var m=n=>{if(typeof require!="undefined")return require(n);throw new Error('Dynamic require of "'+n+'" is not supported')};var x=(n,e)=>{var r={};for(var o in n)C.call(n,o)&&e.indexOf(o)<0&&(r[o]=n[o]);if(n!=null&&h)for(var o of h(n))e.indexOf(o)<0&&W.call(n,o)&&(r[o]=n[o]);return r},nn=(n,e)=>()=>(n&&(e=n(n=0)),e);var A=(n,e)=>{for(var r in e)f(n,r,{get:e[r],enumerable:!0})},en=(n,e,r)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of Q(e))!C.call(n,o)&&o!=="default"&&f(n,o,{get:()=>e[o],enumerable:!(r=V(e,o))||r.enumerable});return n},u=n=>en(Z(f(n!=null?U(X(n)):{},"default",n&&n.__esModule&&"default"in n?{get:()=>n.default,enumerable:!0}:{value:n,enumerable:!0})),n);var B={};A(B,{default:()=>gn});var j,b,J,un,gn,G=nn(()=>{j=u(m("child_process")),b=(()=>{let n=new Map,o=`[${(0,j.spawnSync)("yarn",["workspaces","list","-v","--json"]).stdout.toString().trim().split(`
`).join(",")}]`,t=JSON.parse(o),a={};return t.forEach(({name:s,location:i})=>{s!=null&&(a[i]=s)}),t.forEach(({name:s,location:i,workspaceDependencies:p})=>{s!=null&&n.set(s,{workspaceLocation:i,dependencies:p.map(d=>{let c=a[d];if(c==null)throw new Error(`Bad dependency of ${c}: ${d}`);return c})})}),n})(),J=n=>{let e=[],r=[],o=new Set,t=new Set,a=s=>{var p;if(t.has(s)){if(!o.has(s))return;r.push(s);let d=r.indexOf(s),c=r.slice(d,r.length).join(" -> ");throw new Error(`Cyclic dependency detected: ${c}`)}let i=(p=b.get(s))==null?void 0:p.dependencies;if(i==null)throw new Error(`Workspace ${n} is not found!`);t.add(s),r.push(s),o.add(s),i.forEach(a),o.delete(s),r.pop(),e.push(s)};return a(n),e},un={__type__:"@generated",information:Object.fromEntries(Array.from(b.entries()).map(o=>{var[n,t]=o,a=t,{dependencies:e}=a,r=x(a,["dependencies"]);return[n,Y(T({},r),{dependencyChain:J(n)})]}).sort(([n],[e])=>n.localeCompare(e))),topologicallyOrdered:(()=>{let n=[],e=new Set;return Array.from(b.keys()).forEach(r=>{J(r).forEach(t=>{e.has(t)||(n.push(t),e.add(t))})}),n})()},gn=un});var hn={};A(hn,{default:()=>yn});var H=u(m("fs")),q=u(m("clipanion"));var l=u(m("fs")),S=u(m("path")),y=`
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: '2'
      - uses: actions/setup-node@v2
        with:
          cache: 'yarn'
      - name: Yarn Install
        run: yarn install --immutable`,rn=(n,e,r)=>{var t,a;let o=n.information[e];if(o==null)throw new Error;return((a=(t=JSON.parse((0,l.readFileSync)((0,S.join)(o.workspaceLocation,"package.json")).toString()))==null?void 0:t.scripts)==null?void 0:a[r])!=null},on=n=>[[".github/workflows/generated-general.yml",`# @generated

name: General
on:
  push:
    branches:
      - main
  pull_request:

jobs:
  lint:${y}
      - name: Format Check
        run: yarn format:check
      - name: Lint
        run: yarn lint
  build:${y}
      - name: Compile
        run: yarn c
  validate:${y}
      - name: Check changed
        run: if [[ \`git status --porcelain\` ]]; then exit 1; fi
  test:${y}
      - name: Test
        run: yarn test
`],...n.topologicallyOrdered.filter(e=>rn(n,e,"deploy")).map(e=>{var o,t;return[`.github/workflows/generated-${`cd-${e}`}.yml`,`# @generated

name: CD ${e}
on:
  push:
    paths:${((t=(o=n.information[e])==null?void 0:o.dependencyChain)!=null?t:[]).map(a=>{var s;return`
      - '${(s=n.information[a])==null?void 0:s.workspaceLocation}/**'`}).join("")}
      - 'configuration/**'
      - '.github/workflows/generated-*-${e}.yml'
    branches:
      - main
env:
  NETLIFY_AUTH_TOKEN: \${{ secrets.NETLIFY_AUTH_TOKEN }}

jobs:
  deploy:${y}
      - name: Build
        run: yarn workspace ${e} build
      - name: Deploy
        run: yarn workspace ${e} deploy
`]})],k=(0,S.join)(".github","workflows"),tn=async n=>{(0,l.existsSync)(k)&&(0,l.readdirSync)(k).forEach(e=>{e.startsWith("generated-")&&(0,l.unlinkSync)((0,S.join)(k,e))}),(0,l.mkdirSync)(k,{recursive:!0}),on(n).forEach(([e,r])=>{(0,l.writeFileSync)(e,r)})},L=tn;var w=u(m("child_process")),P=u(m("fs")),E=u(m("path"));var g=n=>process.stderr.isTTY?e=>`[${n}m${e}[0m`:e=>e,I=g(31),O=g(32),v=g(33),N=g(34),_=g(35),wn=g(36);var sn=["\u280B","\u2819","\u2839","\u2838","\u283C","\u2834","\u2826","\u2827","\u2807","\u280F"],an=n=>{let e=0,r=new Date().getTime();return setInterval(()=>{let o=`${((new Date().getTime()-r)/1e3).toFixed(1)}s`,t=n(o),a=sn[e%10];process.stderr.write(v(`${t} ${a}\r`)),e+=1},process.stderr.isTTY?40:1e3)},D=an;var cn=n=>{let e=(r,o)=>{let t=(0,w.spawnSync)("git",["diff",r,...o?[o]:[],"--name-only","--",n]).stdout.toString().trim();return t===""?[]:t.split(`
`)};return process.env.CI?e("HEAD^","HEAD"):e("origin/main")},ln=n=>JSON.parse((0,P.readFileSync)(n).toString()),pn=(n,e)=>{var t,a;let r=s=>{var i,p;return(0,E.dirname)(s)!==(0,E.join)((p=(i=n.information[e])==null?void 0:i.workspaceLocation)!=null?p:".","bin")};return((a=(t=n.information[e])==null?void 0:t.dependencyChain)!=null?a:[]).some(s=>{var d,c;let i=(c=(d=n.information[s])==null?void 0:d.workspaceLocation)!=null?c:".";return cn(i).some(r)})},dn=n=>n.topologicallyOrdered.map(e=>{let r=pn(n,e);return[e,r]}).filter(([,e])=>e).map(([e])=>e),mn=async()=>{let n=ln("workspaces.json"),e=dn(n);e.forEach(i=>{console.error(N(`[i] \`${i}\` needs to be recompiled.`))});let r=D(i=>`[?] Compiling (${i})`),t=await Promise.all(e.map(i=>{let p=(0,w.spawn)("yarn",["workspace",i,"compile"],{shell:!0,stdio:["ignore","pipe","ignore"]}),d="";return p.stdout.on("data",c=>{d+=c.toString()}),new Promise(c=>{p.on("exit",M=>c([i,M===0,d]))})}));clearInterval(r);let a=t.map(i=>i[2]).join(""),s=t.filter(i=>!i[1]).map(i=>i[0]);return s.length===0?(console.error(O("[\u2713] All workspaces have been successfully compiled!")),!0):(console.error(_("[!] Compilation finished with some errors.")),console.error(a.trim()),s.forEach(i=>{console.error(I(`[x] \`${i}\` failed to exit with 0.`))}),!1)},R=mn;var $=class extends q.Command{async execute(){return await R()?0:1}};$.paths=[["c"]];var fn={hooks:{afterAllInstalled:()=>{let n=(G(),B).default;(0,H.writeFileSync)("workspaces.json",`${JSON.stringify(n,void 0,2)}
`),L(n)}},commands:[$]},yn=fn;return hn;})();
return plugin;
}
};
