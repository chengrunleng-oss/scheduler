import{t as e}from"./purify.es-DrVcFY1Q.js";import{Wt as t,m as n,n as r,ot as i}from"./lib-BvER2XX_.js";import{A as a,D as o,E as s,I as c,L as l,h as u,j as d,k as f}from"./lib-7LphfdPx.js";var p=Object.defineProperty,m=Object.getOwnPropertySymbols,h=Object.prototype.hasOwnProperty,g=Object.prototype.propertyIsEnumerable,_=(e,t,n)=>t in e?p(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n,v=(e,t)=>{for(var n in t||={})h.call(t,n)&&_(e,n,t[n]);if(m)for(var n of m(t))g.call(t,n)&&_(e,n,t[n]);return e};function y(e,t){return Object.assign(e,{meta:v({package:`@milkdown/components`},t)}),e}var b=r({renderLabel:({label:e,listType:t,checked:n})=>n==null?t===`bullet`?`⦿`:e:n?`☑`:`□`},`listItemBlockConfigCtx`);y(b,{displayName:`Config<list-item-block>`,group:`ListItemBlock`});function x({icon:t,class:n,onClick:r}){return d(`span`,{class:s(`milkdown-icon`,n),onPointerdown:r,innerHTML:t?e.sanitize(t.trim()):void 0})}x.props={icon:{type:String,required:!1},class:{type:String,required:!1},onClick:{type:Function,required:!1}};var S=a({props:{label:{type:Object,required:!0},checked:{type:Object,required:!0},listType:{type:Object,required:!0},config:{type:Object,required:!0},readonly:{type:Object,required:!0},selected:{type:Object,required:!0},setAttr:{type:Function,required:!0},onMount:{type:Function,required:!0}},setup({label:e,checked:t,listType:n,config:r,readonly:i,setAttr:a,onMount:o,selected:c}){let l=e=>{e!=null&&e instanceof Element&&o(e)},u=e=>{e.stopPropagation(),e.preventDefault(),t.value!=null&&a(`checked`,!t.value)},p=f(()=>r.renderLabel({label:e.value,listType:n.value,checked:t.value,readonly:i.value})),m=f(()=>t.value==null?n.value===`bullet`?`bullet`:`ordered`:t.value?`checked`:`unchecked`);return()=>d(`li`,{class:s(`list-item`,c.value&&`ProseMirror-selectednode`)},d(`div`,{class:`label-wrapper`,onPointerdown:u,contenteditable:!1},d(x,{class:s(`label`,i.value&&`readonly`,m.value),icon:p.value})),d(`div`,{class:`children`,ref:l}))}}),C=n(u.node,e=>(t,n,r)=>{let a=document.createElement(`div`);a.className=`milkdown-list-item-block`;let s=document.createElement(`div`);s.setAttribute(`data-content-dom`,`true`),s.classList.add(`content-dom`);let u=l(t.attrs.label),d=l(t.attrs.checked),f=l(t.attrs.listType),p=l(!n.editable),m=e.get(b.key),h=l(!1),g=(e,t)=>{if(!n.editable)return;let i=r();i!=null&&(n.hasFocus()||n.focus(),n.dispatch(n.state.tr.setNodeAttribute(i,e,t)))},_=c(()=>{h.value?a.classList.add(`selected`):a.classList.remove(`selected`)}),v=0,y=o(S,{label:u,checked:d,listType:f,readonly:p,config:m,selected:h,setAttr:g,onMount:e=>{let{anchor:t,head:r}=n.state.selection;e.appendChild(s);let a=n.state.doc.resolve(t),o=n.state.doc.resolve(r);v=requestAnimationFrame(()=>{if(v=0,n.isDestroyed||!a.doc.eq(n.state.doc))return;let e=new i(a,o);n.dispatch(n.state.tr.setSelection(e))})}});y.mount(a);let x=e=>{f.value=e.attrs.listType,u.value=e.attrs.label,d.value=e.attrs.checked,p.value=!n.editable};x(t);let C=t;return{dom:a,contentDOM:s,update:e=>e.type===t.type?e.sameMarkup(C)&&e.content.eq(C.content)?!0:(C=e,x(e),!0):!1,ignoreMutation:e=>!a||!s?!0:e.type===`selection`?!1:s===e.target&&e.type===`attributes`||!s.contains(e.target),selectNode:()=>{h.value=!0},deselectNode:()=>{h.value=!1},destroy:()=>{cancelAnimationFrame(v),_(),y.unmount(),a.remove(),s.remove()}}});y(C,{displayName:`NodeView<list-item-block>`,group:`ListItemBlock`});var w=[b,C];t([],`FeaturesCtx`),t({},`CrepeCtx`);function T(e){return e.use(`FeaturesCtx`)}function E(e){return t=>{T(t).update(t=>t.includes(e)?t:[...t,e])}}var D=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_952_6527)">
      <circle cx="12" cy="12" r="3" />
    </g>
    <defs>
      <clipPath id="clip0_952_6527">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,O=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_1803_1151)">
      <path
        d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM10.71 16.29C10.32 16.68 9.69 16.68 9.3 16.29L5.71 12.7C5.32 12.31 5.32 11.68 5.71 11.29C6.1 10.9 6.73 10.9 7.12 11.29L10 14.17L16.88 7.29C17.27 6.9 17.9 6.9 18.29 7.29C18.68 7.68 18.68 8.31 18.29 8.7L10.71 16.29Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_1803_1151">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,k=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_1803_535)">
      <path
        d="M18 19H6C5.45 19 5 18.55 5 18V6C5 5.45 5.45 5 6 5H18C18.55 5 19 5.45 19 6V18C19 18.55 18.55 19 18 19ZM19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_1803_535">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,A=(e=>(e.CodeMirror=`code-mirror`,e.ListItem=`list-item`,e.LinkTooltip=`link-tooltip`,e.Cursor=`cursor`,e.ImageBlock=`image-block`,e.BlockEdit=`block-edit`,e.Toolbar=`toolbar`,e.Placeholder=`placeholder`,e.Table=`table`,e.Latex=`latex`,e.TopBar=`top-bar`,e.AI=`ai`,e))(A||{});function j(e,t){e.set(b.key,{renderLabel:({label:e,listType:n,checked:r})=>r==null?n===`bullet`?t?.bulletIcon??D:e:r?t?.checkBoxCheckedIcon??O:t?.checkBoxUncheckedIcon??k})}var M=(e,t)=>{e.config(E(A.ListItem)).config(e=>j(e,t)).use(w)};export{M as listItem};