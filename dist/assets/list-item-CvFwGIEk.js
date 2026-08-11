import{_ as e,g as t,i as n,l as r,n as i,t as a,u as o}from"./purify.es-uVx_0VWa.js";import{Wt as s,m as c,n as l,ot as u}from"./lib-BvER2XX_.js";import{E as d,h as f}from"./lib-FemPHOH5.js";var p=Object.defineProperty,m=Object.getOwnPropertySymbols,h=Object.prototype.hasOwnProperty,g=Object.prototype.propertyIsEnumerable,_=(e,t,n)=>t in e?p(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n,v=(e,t)=>{for(var n in t||={})h.call(t,n)&&_(e,n,t[n]);if(m)for(var n of m(t))g.call(t,n)&&_(e,n,t[n]);return e};function y(e,t){return Object.assign(e,{meta:v({package:`@milkdown/components`},t)}),e}var b=l({renderLabel:({label:e,listType:t,checked:n})=>n==null?t===`bullet`?`⦿`:e:n?`☑`:`□`},`listItemBlockConfigCtx`);y(b,{displayName:`Config<list-item-block>`,group:`ListItemBlock`});function x({icon:e,class:t,onClick:n}){return o(`span`,{class:d(`milkdown-icon`,t),onPointerdown:n,innerHTML:e?a.sanitize(e.trim()):void 0})}x.props={icon:{type:String,required:!1},class:{type:String,required:!1},onClick:{type:Function,required:!1}};var S=r({props:{label:{type:Object,required:!0},checked:{type:Object,required:!0},listType:{type:Object,required:!0},config:{type:Object,required:!0},readonly:{type:Object,required:!0},selected:{type:Object,required:!0},setAttr:{type:Function,required:!0},onMount:{type:Function,required:!0}},setup({label:e,checked:t,listType:r,config:i,readonly:a,setAttr:s,onMount:c,selected:l}){let u=e=>{e!=null&&e instanceof Element&&c(e)},f=e=>{e.stopPropagation(),e.preventDefault(),t.value!=null&&s(`checked`,!t.value)},p=n(()=>i.renderLabel({label:e.value,listType:r.value,checked:t.value,readonly:a.value})),m=n(()=>t.value==null?r.value===`bullet`?`bullet`:`ordered`:t.value?`checked`:`unchecked`);return()=>o(`li`,{class:d(`list-item`,l.value&&`ProseMirror-selectednode`)},o(`div`,{class:`label-wrapper`,onPointerdown:f,contenteditable:!1},o(x,{class:d(`label`,a.value&&`readonly`,m.value),icon:p.value})),o(`div`,{class:`children`,ref:u}))}}),C=c(f.node,n=>(r,a,o)=>{let s=document.createElement(`div`);s.className=`milkdown-list-item-block`;let c=document.createElement(`div`);c.setAttribute(`data-content-dom`,`true`),c.classList.add(`content-dom`);let l=e(r.attrs.label),d=e(r.attrs.checked),f=e(r.attrs.listType),p=e(!a.editable),m=n.get(b.key),h=e(!1),g=(e,t)=>{if(!a.editable)return;let n=o();n!=null&&(a.hasFocus()||a.focus(),a.dispatch(a.state.tr.setNodeAttribute(n,e,t)))},_=t(()=>{h.value?s.classList.add(`selected`):s.classList.remove(`selected`)}),v=0,y=i(S,{label:l,checked:d,listType:f,readonly:p,config:m,selected:h,setAttr:g,onMount:e=>{let{anchor:t,head:n}=a.state.selection;e.appendChild(c);let r=a.state.doc.resolve(t),i=a.state.doc.resolve(n);v=requestAnimationFrame(()=>{if(v=0,a.isDestroyed||!r.doc.eq(a.state.doc))return;let e=new u(r,i);a.dispatch(a.state.tr.setSelection(e))})}});y.mount(s);let x=e=>{f.value=e.attrs.listType,l.value=e.attrs.label,d.value=e.attrs.checked,p.value=!a.editable};x(r);let C=r;return{dom:s,contentDOM:c,update:e=>e.type===r.type?e.sameMarkup(C)&&e.content.eq(C.content)?!0:(C=e,x(e),!0):!1,ignoreMutation:e=>!s||!c?!0:e.type===`selection`?!1:c===e.target&&e.type===`attributes`||!c.contains(e.target),selectNode:()=>{h.value=!0},deselectNode:()=>{h.value=!1},destroy:()=>{cancelAnimationFrame(v),_(),y.unmount(),s.remove(),c.remove()}}});y(C,{displayName:`NodeView<list-item-block>`,group:`ListItemBlock`});var w=[b,C];s([],`FeaturesCtx`),s({},`CrepeCtx`);function T(e){return e.use(`FeaturesCtx`)}function E(e){return t=>{T(t).update(t=>t.includes(e)?t:[...t,e])}}var D=`
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