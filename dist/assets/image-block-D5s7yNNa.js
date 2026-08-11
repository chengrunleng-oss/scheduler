import{_ as e,g as t,l as n,n as r,r as i,t as a,u as o}from"./purify.es-uVx_0VWa.js";import{Wt as s,m as c,n as l}from"./lib-BvER2XX_.js";import{E as u,u as d}from"./lib-FemPHOH5.js";import{i as f,n as p,t as m}from"./image-block-CR9oJpas.js";var h=Object.defineProperty,g=Object.getOwnPropertySymbols,_=Object.prototype.hasOwnProperty,v=Object.prototype.propertyIsEnumerable,y=(e,t,n)=>t in e?h(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n,b=(e,t)=>{for(var n in t||={})_.call(t,n)&&y(e,n,t[n]);if(g)for(var n of g(t))v.call(t,n)&&y(e,n,t[n]);return e};function x(e,t){return Object.assign(e,{meta:b({package:`@milkdown/components`},t)}),e}var S=l({imageIcon:`🌌`,uploadButton:`Upload`,confirmButton:`⏎`,uploadPlaceholderText:`/Paste`,onUpload:e=>Promise.resolve(URL.createObjectURL(e))},`inlineImageConfigCtx`);x(S,{displayName:`Config<image-inline>`,group:`ImageInline`});function C({icon:e,class:t,onClick:n}){return o(`span`,{class:u(`milkdown-icon`,t),onPointerdown:n,innerHTML:e?a.sanitize(e.trim()):void 0})}C.props={icon:{type:String,required:!1},class:{type:String,required:!1},onClick:{type:Function,required:!1}};var w=f(`abcdefg`,8),T=n({props:{src:{type:Object,required:!0},selected:{type:Object,required:!0},readonly:{type:Object,required:!0},setLink:{type:Function,required:!0},imageIcon:{type:String,required:!1},uploadButton:{type:String,required:!1},confirmButton:{type:String,required:!1},uploadPlaceholderText:{type:String,required:!1},onUpload:{type:Function,required:!0},onImageLoadError:{type:Function,required:!1}},setup({readonly:t,src:n,setLink:r,onUpload:a,imageIcon:s,uploadButton:c,confirmButton:l,uploadPlaceholderText:d,className:f,onImageLoadError:p}){let m=e(!1),h=e(),g=e(n.value??``),_=e(w()),v=e(n.value?.length!==0),y=e=>{let t=e.target.value;v.value=t.length!==0,g.value=t},b=e=>{e.key===`Enter`&&r(h.value?.value??``)},x=()=>{r(h.value?.value??``)},S=e=>{let t=e.target.files?.[0];t&&a(t).then(e=>{e&&(r(e),v.value=!0)}).catch(e=>{console.error(`An error occurred while uploading image`),console.error(e)})};return()=>o(`div`,{class:u(`image-edit`,f)},o(C,{icon:s,class:`image-icon`}),o(`div`,{class:u(`link-importer`,m.value&&`focus`)},o(`input`,{ref:h,draggable:`true`,onDragstart:e=>{e.preventDefault(),e.stopPropagation()},disabled:t.value,class:`link-input-area`,value:g.value,onInput:y,onKeydown:b,onFocus:()=>m.value=!0,onBlur:()=>m.value=!1}),!v.value&&o(`div`,{class:`placeholder`},o(`input`,{disabled:t.value,class:`hidden`,id:_.value,type:`file`,accept:`image/*`,onChange:S}),o(`label`,{class:`uploader`,for:_.value},o(C,{icon:c})),o(`span`,{class:`text`,onClick:()=>h.value?.focus()},d))),g.value&&o(i,null,o(`div`,{class:`image-preview`},o(`img`,{src:g.value,alt:``,onError:e=>Promise.resolve(p?.(e)).catch(()=>{})})),o(`div`,{class:`confirm`,onClick:()=>x()},o(C,{icon:l}))))}}),E=n({props:{src:{type:Object,required:!0},alt:{type:Object,required:!0},title:{type:Object,required:!0},selected:{type:Object,required:!0},readonly:{type:Object,required:!0},setAttr:{type:Function,required:!0},config:{type:Object,required:!0}},setup(e){let{src:t,alt:n,title:r}=e;return()=>t.value?.length?o(`img`,{class:`image-inline`,src:t.value,alt:n.value,title:r.value}):o(T,{src:e.src,selected:e.selected,readonly:e.readonly,setLink:t=>e.setAttr(`src`,t),imageIcon:e.config.imageIcon,uploadButton:e.config.uploadButton,confirmButton:e.config.confirmButton,uploadPlaceholderText:e.config.uploadPlaceholderText,onUpload:e.config.onUpload,className:`empty-image-inline`})}}),D=c(d.node,n=>(i,o,s)=>{let c=e(i.attrs.src),l=e(i.attrs.alt),u=e(i.attrs.title),d=e(!1),f=e(!o.editable),p=(e,t)=>{if(!o.editable)return;let n=s();n!=null&&o.dispatch(o.state.tr.setNodeAttribute(n,e,e===`src`?a.sanitize(t):t))},m=n.get(S.key),h=r(E,{src:c,alt:l,title:u,selected:d,readonly:f,setAttr:p,config:m}),g=document.createElement(`span`);g.className=`milkdown-image-inline`;let _=t(()=>{d.value?g.classList.add(`selected`):g.classList.remove(`selected`)}),v=m.proxyDomURL,y=e=>{if(!v)c.value=e.attrs.src;else{let t=v(e.attrs.src);typeof t==`string`?c.value=t:t.then(e=>{c.value=e}).catch(console.error)}l.value=e.attrs.alt,u.value=e.attrs.title};return y(i),h.mount(g),{dom:g,update:e=>e.type===i.type&&(y(e),!0),stopEvent:e=>e.target instanceof HTMLInputElement,selectNode:()=>{d.value=!0},deselectNode:()=>{d.value=!1},destroy:()=>{_(),h.unmount(),g.remove()}}});x(D,{displayName:`NodeView<image-inline>`,group:`ImageInline`});var O=[S,D];s([],`FeaturesCtx`),s({},`CrepeCtx`);function k(e){return e.use(`FeaturesCtx`)}function A(e){return t=>{k(t).update(t=>t.includes(e)?t:[...t,e])}}var j=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="32"
    height="32"
    viewBox="0 0 24 24"
  >
    <path
      fill="currentColor"
      d="M9 22a1 1 0 0 1-1-1v-3H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6.1l-3.7 3.71c-.2.19-.45.29-.7.29zm1-6v3.08L13.08 16H20V4H4v12z"
    />
  </svg>
`,M=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
  >
    <g clip-path="url(#clip0_1013_1606)">
      <path
        d="M9.00012 16.1998L5.50012 12.6998C5.11012 12.3098 4.49012 12.3098 4.10012 12.6998C3.71012 13.0898 3.71012 13.7098 4.10012 14.0998L8.29012 18.2898C8.68012 18.6798 9.31012 18.6798 9.70012 18.2898L20.3001 7.69982C20.6901 7.30982 20.6901 6.68982 20.3001 6.29982C19.9101 5.90982 19.2901 5.90982 18.9001 6.29982L9.00012 16.1998Z"
        fill="#817567"
      />
    </g>
    <defs>
      <clipPath id="clip0_1013_1606">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,N=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_977_8075)">
      <path
        d="M19 5V19H5V5H19ZM19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM14.14 11.86L11.14 15.73L9 13.14L6 17H18L14.14 11.86Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_977_8075">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,P=(e=>(e.CodeMirror=`code-mirror`,e.ListItem=`list-item`,e.LinkTooltip=`link-tooltip`,e.Cursor=`cursor`,e.ImageBlock=`image-block`,e.BlockEdit=`block-edit`,e.Toolbar=`toolbar`,e.Placeholder=`placeholder`,e.Table=`table`,e.Latex=`latex`,e.TopBar=`top-bar`,e.AI=`ai`,e))(P||{}),F=(e,t)=>{e.config(A(P.ImageBlock)).config(e=>{e.update(S.key,e=>({uploadButton:t?.inlineUploadButton??`Upload`,imageIcon:t?.inlineImageIcon??N,confirmButton:t?.inlineConfirmButton??M,uploadPlaceholderText:t?.inlineUploadPlaceholderText??`or paste link`,onUpload:t?.inlineOnUpload??t?.onUpload??e.onUpload,proxyDomURL:t?.proxyDomURL})),e.update(p.key,e=>({uploadButton:t?.blockUploadButton??`Upload file`,imageIcon:t?.blockImageIcon??N,captionIcon:t?.blockCaptionIcon??j,confirmButton:t?.blockConfirmButton??`Confirm`,captionPlaceholderText:t?.blockCaptionPlaceholderText??`Write Image Caption`,uploadPlaceholderText:t?.blockUploadPlaceholderText??`or paste link`,onUpload:t?.blockOnUpload??t?.onUpload??e.onUpload,proxyDomURL:t?.proxyDomURL,onImageLoadError:t?.onImageLoadError??e.onImageLoadError,maxWidth:t?.maxWidth,maxHeight:t?.maxHeight}))}).use(m).use(O)};export{F as imageBlock};