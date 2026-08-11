import{_ as e,g as t,h as n,i as r,l as i,n as a,p as o,r as s,u as c}from"./purify.es-uVx_0VWa.js";import{F as l,K as u,R as d,Wt as f,n as p,nt as m,ot as h,rt as g,tt as _,u as v,w as y,x as b,z as ee}from"./lib-BvER2XX_.js";import{T as x,_ as te,a as ne,b as S,c as C,g as re,h as ie,i as w,l as ae,n as oe,r as se,t as T,y as ce}from"./lib-FemPHOH5.js";import{r as le}from"./image-block-CR9oJpas.js";import{t as ue}from"./debounce-Co24qnHB.js";import{i as de,n as fe,o as pe,r as me}from"./floating-ui.dom-CQBsgrtr.js";import{a as he}from"./lib-B_s621Gb.js";import{t as E}from"./lib-jt95kdon.js";function D(e,t){return Object.assign(e,{meta:{package:`@milkdown/plugin-block`,...t}}),e}var O=p({filterNodes:e=>!d(e=>e.type.name===`table`)(e)},`blockConfig`);D(O,{displayName:`Ctx<blockConfig>`});function ge(e,t,n){if(!e.dom.parentElement)return null;try{let r=e.posAtCoords({left:t.x,top:t.y})?.inside;if(r==null||r<0)return null;let i=e.state.doc.resolve(r),a=e.state.doc.nodeAt(r),o=e.nodeDOM(r),s=t=>{let r=i.depth>=1&&i.index(i.depth)===0;if(!(t||r))return;let c=i.before(i.depth);a=e.state.doc.nodeAt(c),o=e.nodeDOM(c),i=e.state.doc.resolve(c),n(i,a)||s(!0)};return s(!n(i,a)),!o||!a?null:{node:a,$pos:i,el:o}}catch{return null}}var _e=l.ie&&l.ie_version<15||l.ios&&l.webkit_version<604,ve=20,ye=class{constructor(){this.#t=()=>{if(!this.#r)return null;let e=this.#r,t=this.#s;if(t&&_.isSelectable(e.node)){let n=_.create(t.state.doc,e.$pos.pos);return t.dispatch(t.state.tr.setSelection(n)),t.focus(),this.#n=n,n}return null},this.#n=null,this.#r=null,this.#i=void 0,this.#a=!1,this.#l=()=>{this.#c?.({type:`hide`}),this.#r=null},this.#u=e=>{this.#r=e,this.#c?.({type:`show`,active:e})},this.bind=(e,t)=>{this.#e=e,this.#c=t},this.addEvent=e=>{e.addEventListener(`mousedown`,this.#d),e.addEventListener(`mouseup`,this.#f),e.addEventListener(`dragstart`,this.#p),e.addEventListener(`dragend`,this.#m)},this.removeEvent=e=>{e.removeEventListener(`mousedown`,this.#d),e.removeEventListener(`mouseup`,this.#f),e.removeEventListener(`dragstart`,this.#p),e.removeEventListener(`dragend`,this.#m)},this.unBind=()=>{this.#c=void 0},this.#d=()=>{this.#i=this.#r?.el.getBoundingClientRect(),this.#t()},this.#f=()=>{if(!this.#a){requestAnimationFrame(()=>{this.#i&&this.#s?.focus()});return}this.#a=!1,this.#n=null},this.#p=e=>{this.#a=!0;let t=this.#s;if(!t)return;t.dom.dataset.dragging=`true`;let n=this.#n;if(e.dataTransfer&&n){let r=n.content();e.dataTransfer.effectAllowed=`copyMove`;let{dom:i,text:a}=t.serializeForClipboard(r);e.dataTransfer.clearData(),e.dataTransfer.setData(_e?`Text`:`text/html`,i.innerHTML),_e||e.dataTransfer.setData(`text/plain`,a);let o=this.#r?.el;o&&e.dataTransfer.setDragImage(o,0,0),t.dragging={slice:r,move:!0}}},this.#m=()=>{this.#s&&this.#g(this.#s)},this.keydownCallback=e=>(this.#l(),this.#a=!1,e.dom.dataset.dragging=`false`,!1),this.#h=pe((e,t)=>{if(!e.editable)return;let n=e.dom.getBoundingClientRect(),r=n.left+n.width/2;if(!(e.root.elementFromPoint(r,t.clientY)instanceof Element)){this.#l();return}let i=this.#o;if(!i)return;let a=ge(e,{x:r,y:t.clientY},i);if(!a){this.#l();return}this.#u(a)},200),this.mousemoveCallback=(e,t)=>(e.composing||!e.editable||this.#h(e,t),!1),this.dragoverCallback=(e,t)=>{if(this.#a){let n=this.#s?.dom.parentElement;if(!n)return!1;let r=n.scrollHeight>n.clientHeight,i=n.getBoundingClientRect();if(r){if(n.scrollTop>0&&Math.abs(t.y-i.y)<ve)return n.scrollTop=n.scrollTop>10?n.scrollTop-10:0,!1;let r=Math.round(e.dom.getBoundingClientRect().height);if(Math.round(n.scrollTop+i.height)<r&&Math.abs(t.y-(i.height+i.y))<ve)return n.scrollTop+=10,!1}}return!1},this.dragenterCallback=e=>{e.dragging&&(this.#a=!0,e.dom.dataset.dragging=`true`)},this.dragleaveCallback=(e,t)=>{let n=t.clientX,r=t.clientY;(n<0||r<0||n>window.innerWidth||r>window.innerHeight)&&(this.#r=null,this.#g(e))},this.dropCallback=e=>(this.#g(e),!1),this.dragendCallback=e=>{this.#g(e)},this.#g=e=>{this.#a=!1,e.dom.dataset.dragging=`false`}}#e;#t;#n;#r;#i;#a;get#o(){try{return this.#e?.get(O.key).filterNodes}catch{return}}get#s(){return this.#e?.get(y)}#c;#l;#u;#d;#f;#p;#m;#h;#g},k=p(()=>new ye,`blockService`),A=p({},`blockServiceInstance`);D(k,{displayName:`Ctx<blockService>`}),D(A,{displayName:`Ctx<blockServiceInstance>`});var j=p({},`blockSpec`);D(j,{displayName:`Ctx<blockSpec>`});var M=v(e=>{let t=new g(`MILKDOWN_BLOCK`),n=e.get(k.key)();e.set(A.key,n);let r=e.get(j.key);return new m({key:t,...r,props:{...r.props,handleDOMEvents:{drop:e=>n.dropCallback(e),pointermove:(e,t)=>n.mousemoveCallback(e,t),keydown:e=>n.keydownCallback(e),dragover:(e,t)=>n.dragoverCallback(e,t),dragleave:(e,t)=>n.dragleaveCallback(e,t),dragenter:e=>n.dragenterCallback(e),dragend:e=>n.dragendCallback(e)}}})});D(M,{displayName:`Prose<block>`});var be=class{#e;#t;#n;#r;#i;#a;#o;#s;#c;#l;#u;get active(){return this.#r}constructor(e){this.#r=null,this.#a=!1,this.update=()=>{requestAnimationFrame(()=>{if(!this.#a)try{this.#d(),this.#a=!0}catch{}})},this.destroy=()=>{this.#n?.unBind(),this.#n?.removeEvent(this.#e),this.#e.remove()},this.show=e=>{let t=e.el,n=this.#t.get(y).dom,r={ctx:this.#t,active:e,editorDom:n,blockDom:this.#e},i={contextElement:t,getBoundingClientRect:()=>this.#l?this.#l(r):t.getBoundingClientRect()},a=[me()];if(this.#c){let e=de(this.#c(r));a.push(e)}fe(i,this.#e,{placement:this.#u?this.#u(r):`left`,middleware:[...a,...this.#o],...this.#s}).then(({x:e,y:t})=>{Object.assign(this.#e.style,{left:`${e}px`,top:`${t}px`}),this.#e.dataset.show=`true`}).catch(console.error)},this.hide=()=>{this.#e.dataset.show=`false`},this.#t=e.ctx,this.#e=e.content,this.#c=e.getOffset,this.#l=e.getPosition,this.#u=e.getPlacement,this.#o=e.middleware??[],this.#s=e.floatingUIOptions??{},this.#i=e.root,this.hide()}#d(){let e=this.#t.get(y);(this.#i??e.dom.parentElement??document.body).appendChild(this.#e);let t=this.#t.get(A.key);t.bind(this.#t,e=>{e.type===`hide`?(this.hide(),this.#r=null):e.type===`show`&&(this.show(e.active),this.#r=e.active)}),this.#n=t,this.#n.addEvent(this.#e),this.#e.draggable=!0}},N=[j,O,k,A,M];N.key=j.key,N.pluginKey=M.key;function xe(e){let t=p({},`${e}_SLASH_SPEC`),n=v(n=>{let r=n.get(t.key);return new m({key:new g(`${e}_SLASH`),...r})}),r=[t,n];return r.key=t.key,r.pluginKey=n.key,t.meta={package:`@milkdown/plugin-slash`,displayName:`Ctx<slashSpec>|${e}`},n.meta={package:`@milkdown/plugin-slash`,displayName:`Prose<slash>|${e}`},r}var Se=class{#e;#t;#n;#r;#i;#a;#o;#s;#c;constructor(e){this.#e=!1,this.onShow=()=>{},this.onHide=()=>{},this.#l=(e,t)=>{let{state:n,composing:r}=e,{selection:i,doc:a}=n,{ranges:o}=i,s=Math.min(...o.map(e=>e.$from.pos)),c=Math.max(...o.map(e=>e.$to.pos)),l=t&&t.doc.eq(a)&&t.selection.eq(i);if(this.#e||=((this.#r??e.dom.parentElement??document.body).appendChild(this.element),!0),!(r||l)){if(!this.#o(e,t)){this.hide();return}fe({getBoundingClientRect:()=>u(e,s,c)},this.element,{placement:`bottom-start`,middleware:[me(),de(this.#c),...this.#t],...this.#n}).then(({x:e,y:t})=>{Object.assign(this.element.style,{left:`${e}px`,top:`${t}px`})}).catch(console.error),this.show()}},this.#u=e=>{let t=this.getContent(e);if(!t)return!1;let n=t.at(-1);return n?Array.isArray(this.#a)?this.#a.includes(n):this.#a===n:!1},this.update=(e,t)=>{this.#s(e,t)},this.getContent=(e,t=e=>e.type.name===`paragraph`)=>{let{selection:n}=e.state,{empty:r,$from:i}=n,a=e.state.selection instanceof h;if(typeof document>`u`)return;let o=this.element.contains(document.activeElement),s=!e.hasFocus()&&!o,c=!e.editable,l=!ee(t)(e.state.selection);if(!(s||c||!r||!a||l))return i.parent.textBetween(Math.max(0,i.parentOffset-500),i.parentOffset,void 0,`￼`)},this.destroy=()=>{this.#s.cancel()},this.show=()=>{this.element.dataset.show=`true`,this.onShow()},this.hide=()=>{this.element.dataset.show=`false`,this.onHide()},this.element=e.content,this.#i=e.debounce??200,this.#o=e.shouldShow??this.#u,this.#a=e.trigger??`/`,this.#c=e.offset,this.#t=e.middleware??[],this.#n=e.floatingUIOptions??{},this.#r=e.root,this.#s=ue(this.#l,this.#i)}#l;#u};f([],`FeaturesCtx`),f({},`CrepeCtx`);function Ce(e){return e.use(`FeaturesCtx`)}function we(e){return t=>{Ce(t).update(t=>t.includes(e)?t:[...t,e])}}var P=(e=>(e.CodeMirror=`code-mirror`,e.ListItem=`list-item`,e.LinkTooltip=`link-tooltip`,e.Cursor=`cursor`,e.ImageBlock=`image-block`,e.BlockEdit=`block-edit`,e.Toolbar=`toolbar`,e.Placeholder=`placeholder`,e.Table=`table`,e.Latex=`latex`,e.TopBar=`top-bar`,e.AI=`ai`,e))(P||{}),Te=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_977_8070)">
      <path
        d="M4 10.5C3.17 10.5 2.5 11.17 2.5 12C2.5 12.83 3.17 13.5 4 13.5C4.83 13.5 5.5 12.83 5.5 12C5.5 11.17 4.83 10.5 4 10.5ZM4 4.5C3.17 4.5 2.5 5.17 2.5 6C2.5 6.83 3.17 7.5 4 7.5C4.83 7.5 5.5 6.83 5.5 6C5.5 5.17 4.83 4.5 4 4.5ZM4 16.5C3.17 16.5 2.5 17.18 2.5 18C2.5 18.82 3.18 19.5 4 19.5C4.82 19.5 5.5 18.82 5.5 18C5.5 17.18 4.83 16.5 4 16.5ZM8 19H20C20.55 19 21 18.55 21 18C21 17.45 20.55 17 20 17H8C7.45 17 7 17.45 7 18C7 18.55 7.45 19 8 19ZM8 13H20C20.55 13 21 12.55 21 12C21 11.45 20.55 11 20 11H8C7.45 11 7 11.45 7 12C7 12.55 7.45 13 8 13ZM7 6C7 6.55 7.45 7 8 7H20C20.55 7 21 6.55 21 6C21 5.45 20.55 5 20 5H8C7.45 5 7 5.45 7 6Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_977_8070">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,Ee=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_977_8081)">
      <path
        d="M9.4 16.6L4.8 12L9.4 7.4L8 6L2 12L8 18L9.4 16.6ZM14.6 16.6L19.2 12L14.6 7.4L16 6L22 12L16 18L14.6 16.6Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_977_8081">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,De=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_977_7900)">
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M19 13H5C4.45 13 4 12.55 4 12C4 11.45 4.45 11 5 11H19C19.55 11 20 11.45 20 12C20 12.55 19.55 13 19 13Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_977_7900">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,Oe=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_992_5553)">
      <path
        d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19ZM12 17H14V7H10V9H12V17Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_992_5553">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,ke=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_992_5559)">
      <path
        d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19ZM15 15H11V13H13C14.1 13 15 12.11 15 11V9C15 7.89 14.1 7 13 7H9V9H13V11H11C9.9 11 9 11.89 9 13V17H15V15Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_992_5559">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,Ae=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_992_5565)">
      <path
        d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19ZM15 15V13.5C15 12.67 14.33 12 13.5 12C14.33 12 15 11.33 15 10.5V9C15 7.89 14.1 7 13 7H9V9H13V11H11V13H13V15H9V17H13C14.1 17 15 16.11 15 15Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_992_5565">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,je=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_977_7757)">
      <path
        d="M19.04 3H5.04004C3.94004 3 3.04004 3.9 3.04004 5V19C3.04004 20.1 3.94004 21 5.04004 21H19.04C20.14 21 21.04 20.1 21.04 19V5C21.04 3.9 20.14 3 19.04 3ZM19.04 19H5.04004V5H19.04V19ZM13.04 17H15.04V7H13.04V11H11.04V7H9.04004V13H13.04V17Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_977_7757">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,Me=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_977_7760)">
      <path
        d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19ZM15 15V13C15 11.89 14.1 11 13 11H11V9H15V7H9V13H13V15H9V17H13C14.1 17 15 16.11 15 15Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_977_7760">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,Ne=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_977_7763)">
      <path
        d="M11 17H13C14.1 17 15 16.11 15 15V13C15 11.89 14.1 11 13 11H11V9H15V7H11C9.9 7 9 7.89 9 9V15C9 16.11 9.9 17 11 17ZM11 13H13V15H11V13ZM19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_977_7763">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,Pe=`
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
`,Fe=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_971_7680)">
      <path
        d="M11 18C11 19.1 10.1 20 9 20C7.9 20 7 19.1 7 18C7 16.9 7.9 16 9 16C10.1 16 11 16.9 11 18ZM9 10C7.9 10 7 10.9 7 12C7 13.1 7.9 14 9 14C10.1 14 11 13.1 11 12C11 10.9 10.1 10 9 10ZM9 4C7.9 4 7 4.9 7 6C7 7.1 7.9 8 9 8C10.1 8 11 7.1 11 6C11 4.9 10.1 4 9 4ZM15 8C16.1 8 17 7.1 17 6C17 4.9 16.1 4 15 4C13.9 4 13 4.9 13 6C13 7.1 13.9 8 15 8ZM15 10C13.9 10 13 10.9 13 12C13 13.1 13.9 14 15 14C16.1 14 17 13.1 17 12C17 10.9 16.1 10 15 10ZM15 16C13.9 16 13 16.9 13 18C13 19.1 13.9 20 15 20C16.1 20 17 19.1 17 18C17 16.9 16.1 16 15 16Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_971_7680">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,Ie=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_977_8067)">
      <path
        d="M8 7H20C20.55 7 21 6.55 21 6C21 5.45 20.55 5 20 5H8C7.45 5 7 5.45 7 6C7 6.55 7.45 7 8 7ZM20 17H8C7.45 17 7 17.45 7 18C7 18.55 7.45 19 8 19H20C20.55 19 21 18.55 21 18C21 17.45 20.55 17 20 17ZM20 11H8C7.45 11 7 11.45 7 12C7 12.55 7.45 13 8 13H20C20.55 13 21 12.55 21 12C21 11.45 20.55 11 20 11ZM4.5 16H2.5C2.22 16 2 16.22 2 16.5C2 16.78 2.22 17 2.5 17H4V17.5H3.5C3.22 17.5 3 17.72 3 18C3 18.28 3.22 18.5 3.5 18.5H4V19H2.5C2.22 19 2 19.22 2 19.5C2 19.78 2.22 20 2.5 20H4.5C4.78 20 5 19.78 5 19.5V16.5C5 16.22 4.78 16 4.5 16ZM2.5 5H3V7.5C3 7.78 3.22 8 3.5 8C3.78 8 4 7.78 4 7.5V4.5C4 4.22 3.78 4 3.5 4H2.5C2.22 4 2 4.22 2 4.5C2 4.78 2.22 5 2.5 5ZM4.5 10H2.5C2.22 10 2 10.22 2 10.5C2 10.78 2.22 11 2.5 11H3.8L2.12 12.96C2.04 13.05 2 13.17 2 13.28V13.5C2 13.78 2.22 14 2.5 14H4.5C4.78 14 5 13.78 5 13.5C5 13.22 4.78 13 4.5 13H3.2L4.88 11.04C4.96 10.95 5 10.83 5 10.72V10.5C5 10.22 4.78 10 4.5 10Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_977_8067">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,Le=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_971_7676)">
      <path
        d="M18 13H13V18C13 18.55 12.55 19 12 19C11.45 19 11 18.55 11 18V13H6C5.45 13 5 12.55 5 12C5 11.45 5.45 11 6 11H11V6C11 5.45 11.45 5 12 5C12.55 5 13 5.45 13 6V11H18C18.55 11 19 11.45 19 12C19 12.55 18.55 13 18 13Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_971_7676">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,Re=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_977_7897)">
      <path
        d="M7.17 17C7.68 17 8.15 16.71 8.37 16.26L9.79 13.42C9.93 13.14 10 12.84 10 12.53V8C10 7.45 9.55 7 9 7H5C4.45 7 4 7.45 4 8V12C4 12.55 4.45 13 5 13H7L5.97 15.06C5.52 15.95 6.17 17 7.17 17ZM17.17 17C17.68 17 18.15 16.71 18.37 16.26L19.79 13.42C19.93 13.14 20 12.84 20 12.53V8C20 7.45 19.55 7 19 7H15C14.45 7 14 7.45 14 8V12C14 12.55 14.45 13 15 13H17L15.97 15.06C15.52 15.95 16.17 17 17.17 17Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_977_7897">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,ze=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_977_8078)">
      <path
        d="M20 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H20C21.1 21 22 20.1 22 19V5C22 3.9 21.1 3 20 3ZM20 5V8H5V5H20ZM15 19H10V10H15V19ZM5 10H8V19H5V10ZM17 19V10H20V19H17Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_977_8078">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,Be=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <g clip-path="url(#clip0_992_5547)">
      <path
        d="M5 5.5C5 6.33 5.67 7 6.5 7H10.5V17.5C10.5 18.33 11.17 19 12 19C12.83 19 13.5 18.33 13.5 17.5V7H17.5C18.33 7 19 6.33 19 5.5C19 4.67 18.33 4 17.5 4H6.5C5.67 4 5 4.67 5 5.5Z"
      />
    </g>
    <defs>
      <clipPath id="clip0_992_5547">
        <rect width="24" height="24" />
      </clipPath>
    </defs>
  </svg>
`,Ve=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <path
      d="M5.66936 16.3389L9.39244 12.6158C9.54115 12.4671 9.71679 12.3937 9.91936 12.3957C10.1219 12.3976 10.2975 12.4761 10.4463 12.6312C10.5847 12.7823 10.654 12.9585 10.654 13.1599C10.654 13.3613 10.5847 13.5363 10.4463 13.6851L6.32704 17.8197C6.14627 18.0004 5.93538 18.0908 5.69436 18.0908C5.45333 18.0908 5.24243 18.0004 5.06166 17.8197L3.01744 15.7754C2.87899 15.637 2.81136 15.4629 2.81456 15.2533C2.81776 15.0437 2.88859 14.8697 3.02706 14.7312C3.16551 14.5928 3.34008 14.5235 3.55076 14.5235C3.76144 14.5235 3.93494 14.5928 4.07126 14.7312L5.66936 16.3389ZM5.66936 8.72359L9.39244 5.00049C9.54115 4.85177 9.71679 4.77838 9.91936 4.78031C10.1219 4.78223 10.2975 4.86075 10.4463 5.01586C10.5847 5.16691 10.654 5.34314 10.654 5.54454C10.654 5.74592 10.5847 5.92097 10.4463 6.06969L6.32704 10.2043C6.14627 10.3851 5.93538 10.4755 5.69436 10.4755C5.45333 10.4755 5.24243 10.3851 5.06166 10.2043L3.01744 8.16009C2.87899 8.02162 2.81136 7.84759 2.81456 7.63799C2.81776 7.42837 2.88859 7.25433 3.02706 7.11586C3.16551 6.97741 3.34008 6.90819 3.55076 6.90819C3.76144 6.90819 3.93494 6.97741 4.07126 7.11586L5.66936 8.72359ZM13.7597 16.5581C13.5472 16.5581 13.3691 16.4862 13.2253 16.3424C13.0816 16.1986 13.0097 16.0204 13.0097 15.8078C13.0097 15.5952 13.0816 15.4171 13.2253 15.2735C13.3691 15.13 13.5472 15.0582 13.7597 15.0582H20.7597C20.9722 15.0582 21.1503 15.1301 21.2941 15.2739C21.4378 15.4177 21.5097 15.5959 21.5097 15.8085C21.5097 16.0211 21.4378 16.1992 21.2941 16.3427C21.1503 16.4863 20.9722 16.5581 20.7597 16.5581H13.7597ZM13.7597 8.94276C13.5472 8.94276 13.3691 8.87085 13.2253 8.72704C13.0816 8.58324 13.0097 8.40504 13.0097 8.19244C13.0097 7.97985 13.0816 7.80177 13.2253 7.65819C13.3691 7.5146 13.5472 7.44281 13.7597 7.44281H20.7597C20.9722 7.44281 21.1503 7.51471 21.2941 7.65851C21.4378 7.80233 21.5097 7.98053 21.5097 8.19311C21.5097 8.40571 21.4378 8.5838 21.2941 8.72739C21.1503 8.87097 20.9722 8.94276 20.7597 8.94276H13.7597Z"
    />
  </svg>
`,He=`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="32"
    height="32"
    viewBox="0 0 24 24"
  >
    <path
      fill="currentColor"
      d="M7 19v-.808L13.096 12L7 5.808V5h10v1.25H9.102L14.727 12l-5.625 5.77H17V19z"
    />
  </svg>
`;function Ue(e){return e.$from.parent.type.name===`code_block`}function We(e){return e.$from.node(e.$from.depth-1)?.type?.name===`list_item`}var Ge=e=>{throw TypeError(e)},Ke=(e,t,n)=>t.has(e)||Ge(`Cannot `+n),F=(e,t,n)=>(Ke(e,t,`read from private field`),n?n.call(e):t.get(e)),qe=(e,t,n)=>t.has(e)?Ge(`Cannot add the same private member more than once`):t instanceof WeakSet?t.add(e):t.set(e,n),Je=(e,t,n,r)=>(Ke(e,t,`write to private field`),t.set(e,n),n),I,L,Ye=class{constructor(){qe(this,I,[]),this.clear=()=>(Je(this,I,[]),this),qe(this,L,e=>{let t={group:e,addItem:(n,r)=>{let i={...r,key:n};return e.items.push(i),t},clear:()=>(e.items=[],t)};return t}),this.addGroup=(e,t)=>{let n={key:e,label:t,items:[]};return F(this,I).push(n),F(this,L).call(this,n)},this.getGroup=e=>{let t=F(this,I).find(t=>t.key===e);if(!t)throw Error(`Group with key ${e} not found`);return F(this,L).call(this,t)},this.build=()=>F(this,I)}};I=new WeakMap,L=new WeakMap;function Xe(e,t,n){var r;let i=n&&Ce(n).get(),a=i?.includes(P.Latex),o=i?.includes(P.ImageBlock),s=i?.includes(P.Table),c=new Ye;if(t?.textGroup!==null){let e=c.addGroup(`text`,t?.textGroup?.label??`Text`);t?.textGroup?.text!==null&&e.addItem(`text`,{label:t?.textGroup?.text?.label??`Text`,icon:t?.textGroup?.text?.icon??Be,onRun:e=>{let t=e.get(b),n=te.type(e);t.call(w.key),t.call(S.key,{nodeType:n})}}),t?.textGroup?.h1!==null&&e.addItem(`h1`,{label:t?.textGroup?.h1?.label??`Heading 1`,icon:t?.textGroup?.h1?.icon??Oe,onRun:e=>{let t=e.get(b),n=C.type(e);t.call(w.key),t.call(S.key,{nodeType:n,attrs:{level:1}})}}),t?.textGroup?.h2!==null&&e.addItem(`h2`,{label:t?.textGroup?.h2?.label??`Heading 2`,icon:t?.textGroup?.h2?.icon??ke,onRun:e=>{let t=e.get(b),n=C.type(e);t.call(w.key),t.call(S.key,{nodeType:n,attrs:{level:2}})}}),t?.textGroup?.h3!==null&&e.addItem(`h3`,{label:t?.textGroup?.h3?.label??`Heading 3`,icon:t?.textGroup?.h3?.icon??Ae,onRun:e=>{let t=e.get(b),n=C.type(e);t.call(w.key),t.call(S.key,{nodeType:n,attrs:{level:3}})}}),t?.textGroup?.h4!==null&&e.addItem(`h4`,{label:t?.textGroup?.h4?.label??`Heading 4`,icon:t?.textGroup?.h4?.icon??je,onRun:e=>{let t=e.get(b),n=C.type(e);t.call(w.key),t.call(S.key,{nodeType:n,attrs:{level:4}})}}),t?.textGroup?.h5!==null&&e.addItem(`h5`,{label:t?.textGroup?.h5?.label??`Heading 5`,icon:t?.textGroup?.h5?.icon??Me,onRun:e=>{let t=e.get(b),n=C.type(e);t.call(w.key),t.call(S.key,{nodeType:n,attrs:{level:5}})}}),t?.textGroup?.h6!==null&&e.addItem(`h6`,{label:t?.textGroup?.h6?.label??`Heading 6`,icon:t?.textGroup?.h6?.icon??Ne,onRun:e=>{let t=e.get(b),n=C.type(e);t.call(w.key),t.call(S.key,{nodeType:n,attrs:{level:6}})}}),t?.textGroup?.quote!==null&&e.addItem(`quote`,{label:t?.textGroup?.quote?.label??`Quote`,icon:t?.textGroup?.quote?.icon??Re,onRun:e=>{let t=e.get(b),n=oe.type(e);t.call(w.key),t.call(x.key,{nodeType:n})}}),t?.textGroup?.divider!==null&&e.addItem(`divider`,{label:t?.textGroup?.divider?.label??`Divider`,icon:t?.textGroup?.divider?.icon??De,onRun:e=>{let t=e.get(b),n=ae.type(e);t.call(w.key),t.call(T.key,{nodeType:n})}})}if(t?.listGroup!==null){let e=c.addGroup(`list`,t?.listGroup?.label??`List`);t?.listGroup?.bulletList!==null&&e.addItem(`bullet-list`,{label:t?.listGroup?.bulletList?.label??`Bullet List`,icon:t?.listGroup?.bulletList?.icon??Te,onRun:e=>{let t=e.get(b),n=se.type(e);t.call(w.key),t.call(x.key,{nodeType:n})}}),t?.listGroup?.orderedList!==null&&e.addItem(`ordered-list`,{label:t?.listGroup?.orderedList?.label??`Ordered List`,icon:t?.listGroup?.orderedList?.icon??Ie,onRun:e=>{let t=e.get(b),n=re.type(e);t.call(w.key),t.call(x.key,{nodeType:n})}}),t?.listGroup?.taskList!==null&&e.addItem(`task-list`,{label:t?.listGroup?.taskList?.label??`Task List`,icon:t?.listGroup?.taskList?.icon??Ve,onRun:e=>{let t=e.get(b),n=ie.type(e);t.call(w.key),t.call(x.key,{nodeType:n,attrs:{checked:!1}})}})}if(t?.advancedGroup!==null){let e=c.addGroup(`advanced`,t?.advancedGroup?.label??`Advanced`);t?.advancedGroup?.image!==null&&o&&e.addItem(`image`,{label:t?.advancedGroup?.image?.label??`Image`,icon:t?.advancedGroup?.image?.icon??Pe,onRun:e=>{let t=e.get(b),n=le.type(e);t.call(w.key),t.call(T.key,{nodeType:n})}}),t?.advancedGroup?.codeBlock!==null&&e.addItem(`code`,{label:t?.advancedGroup?.codeBlock?.label??`Code`,icon:t?.advancedGroup?.codeBlock?.icon??Ee,onRun:e=>{let t=e.get(b),n=ne.type(e);t.call(w.key),t.call(S.key,{nodeType:n})}}),t?.advancedGroup?.table!==null&&s&&e.addItem(`table`,{label:t?.advancedGroup?.table?.label??`Table`,icon:t?.advancedGroup?.table?.icon??ze,onRun:e=>{let t=e.get(b),n=e.get(y);t.call(w.key);let{from:r}=n.state.selection;t.call(T.key,{nodeType:he(e,3,3)}),t.call(ce.key,{pos:r})}}),t?.advancedGroup?.math!==null&&a&&e.addItem(`math`,{label:t?.advancedGroup?.math?.label??`Math`,icon:t?.advancedGroup?.math?.icon??He,onRun:e=>{let t=e.get(b),n=ne.type(e);t.call(w.key),t.call(T.key,{nodeType:n,attrs:{language:`LaTeX`}})}})}(r=t?.buildMenu)==null||r.call(t,c);let l=c.build();e&&(l=l.map(t=>{let n=t.items.filter(t=>t.label.toLowerCase().includes(e.toLowerCase()));return{...t,items:n}}).filter(e=>e.items.length>0));let u=l.flatMap(e=>e.items);return u.forEach((e,t)=>{Object.assign(e,{index:t})}),l.reduce((e,t)=>{let n=e+t.items.length;return Object.assign(t,{range:[e,n]}),n},0),{groups:l,size:u.length}}var Ze=i({props:{ctx:{type:Object,required:!0},show:{type:Object,required:!0},filter:{type:Object,required:!0},hide:{type:Function,required:!0},config:{type:Object,required:!1}},setup({ctx:i,show:a,filter:s,hide:l,config:u}){let d=e(),f=r(()=>Xe(s.value,u,i)),p=e(0),m=e({x:-999,y:-999}),h=e=>{let{x:t,y:n}=e;m.value={x:t,y:n}};n([f,a],()=>{let{size:e}=f.value;e===0&&a.value?l():p.value>=e&&(p.value=0)});let g=(e,t)=>{let n=p.value,r=typeof e==`function`?e(n):e;t?.(r),p.value=r},_=e=>{let t=d.value?.querySelector(`[data-index="${e}"]`),n=d.value?.querySelector(`.menu-groups`);!t||!n||(n.scrollTop=t.offsetTop-n.offsetTop)},v=e=>{let t=f.value.groups.flatMap(e=>e.items).at(e);t?.onRun&&i&&t.onRun(i),l()},y=e=>{let{size:t,groups:n}=f.value;if(e.key===`Escape`){e.preventDefault(),l?.();return}if(e.key===`ArrowDown`)return e.preventDefault(),g(e=>e<t-1?e+1:e,_);if(e.key===`ArrowUp`)return e.preventDefault(),g(e=>e<=0?e:e-1,_);if(e.key===`ArrowLeft`)return e.preventDefault(),g(e=>{let t=n.find(t=>t.range[0]<=e&&t.range[1]>e);if(!t)return e;let r=n[n.indexOf(t)-1];return r?r.range[1]-1:e},_);if(e.key===`ArrowRight`)return e.preventDefault(),g(e=>{let t=n.find(t=>t.range[0]<=e&&t.range[1]>e);if(!t)return e;let r=n[n.indexOf(t)+1];return r?r.range[0]:e},_);e.key===`Enter`&&(e.preventDefault(),v(p.value))},b=e=>t=>{let n=m.value;if(!n)return;let{x:r,y:i}=t;(r!==n.x||i!==n.y)&&g(e)};return t(()=>{a.value?window.addEventListener(`keydown`,y,{capture:!0}):window.removeEventListener(`keydown`,y,{capture:!0})}),o(()=>{window.removeEventListener(`keydown`,y,{capture:!0})}),()=>c(`div`,{ref:d,onPointerdown:e=>e.preventDefault()},c(`nav`,{class:`tab-group`},c(`ul`,null,f.value.groups.map(e=>c(`li`,{key:e.key,onPointerdown:()=>g(e.range[0],_),class:p.value>=e.range[0]&&p.value<e.range[1]?`selected`:``},e.label)))),c(`div`,{class:`menu-groups`,onPointermove:h},f.value.groups.map(e=>c(`div`,{key:e.key,class:`menu-group`},c(`h6`,null,e.label),c(`ul`,null,e.items.map(e=>c(`li`,{key:e.key,"data-index":e.index,class:p.value===e.index?`hover`:``,onPointerenter:b(e.index),onPointerdown:()=>{var t;(t=d.value?.querySelector(`[data-index="${e.index}"]`))==null||t.classList.add(`active`)},onPointerup:()=>{var t;(t=d.value?.querySelector(`[data-index="${e.index}"]`))==null||t.classList.remove(`active`),v(e.index)}},c(E,{icon:e.icon}),c(`span`,null,e.label))))))))}}),Qe=e=>{throw TypeError(e)},$e=(e,t,n)=>t.has(e)||Qe(`Cannot `+n),R=(e,t,n)=>($e(e,t,`read from private field`),n?n.call(e):t.get(e)),z=(e,t,n)=>t.has(e)?Qe(`Cannot add the same private member more than once`):t instanceof WeakSet?t.add(e):t.set(e,n),B=(e,t,n,r)=>($e(e,t,`write to private field`),t.set(e,n),n),V,H,U,W,G,et=xe(`CREPE_MENU`),K=p({show:()=>{},hide:()=>{}},`menuAPICtx`);function tt(e,t){e.set(et.key,{view:n=>new nt(e,n,t)})}var nt=class{constructor(t,n,r){z(this,V),z(this,H),z(this,U),z(this,W),z(this,G,null),this.update=e=>{R(this,W).update(e)},this.show=e=>{B(this,G,e),R(this,U).value=``,R(this,W).show()},this.hide=()=>{B(this,G,null),R(this,W).hide()},this.destroy=()=>{R(this,W).destroy(),R(this,H).unmount(),R(this,V).remove()};let i=document.createElement(`div`);i.classList.add(`milkdown-slash-menu`);let o=e(!1),s=e(``);B(this,U,s);let c=this.hide,l=a(Ze,{ctx:t,config:r,show:o,filter:s,hide:c});B(this,H,l),l.mount(i),B(this,V,i);let u=this;B(this,W,new Se({content:R(this,V),debounce:20,shouldShow(e){if(Ue(e.state.selection)||We(e.state.selection))return!1;let t=this.getContent(e,e=>[`paragraph`,`heading`].includes(e.type.name));if(t==null||!rt(e.state.selection))return!1;let n=R(u,G);if(s.value=t.startsWith(`/`)?t.slice(1):t,typeof n==`number`){let t=e.state.doc.nodeSize-2,r=Math.min(n,t);return e.state.doc.resolve(r).node()===e.state.doc.resolve(e.state.selection.from).node()||(B(u,G,null),!1)}return!!t.startsWith(`/`)},offset:10})),R(this,W).onShow=()=>{o.value=!0},R(this,W).onHide=()=>{o.value=!1},this.update(n),t.set(K.key,{show:e=>this.show(e),hide:()=>this.hide()})}};V=new WeakMap,H=new WeakMap,U=new WeakMap,W=new WeakMap,G=new WeakMap;function rt(e){if(!(e instanceof h))return!1;let{$head:t}=e,n=t.parent;return t.parentOffset===n.content.size}var it=i({props:{onAdd:{type:Function,required:!0},addIcon:{type:String,required:!0},handleIcon:{type:String,required:!0}},setup(t){let n=e();return()=>c(s,null,c(`div`,{ref:n,class:`operation-item`,onPointerdown:e=>{var t;e.preventDefault(),e.stopPropagation(),(t=n.value)==null||t.classList.add(`active`)},onPointerup:e=>{var r;e.preventDefault(),e.stopPropagation(),(r=n.value)==null||r.classList.remove(`active`),t.onAdd()}},c(E,{icon:t.addIcon})),c(`div`,{class:`operation-item`},c(E,{icon:t.handleIcon})))}}),at=e=>{throw TypeError(e)},ot=(e,t,n)=>t.has(e)||at(`Cannot `+n),q=(e,t,n)=>(ot(e,t,`read from private field`),n?n.call(e):t.get(e)),J=(e,t,n)=>t.has(e)?at(`Cannot add the same private member more than once`):t instanceof WeakSet?t.add(e):t.set(e,n),Y=(e,t,n,r)=>(ot(e,t,`write to private field`),t.set(e,n),n),X,Z,Q,$,st=class{constructor(e,t){J(this,X),J(this,Z),J(this,Q),J(this,$),this.update=()=>{q(this,Z).update()},this.destroy=()=>{q(this,Z).destroy(),q(this,X).remove(),q(this,Q).unmount()},this.onAdd=()=>{let e=q(this,$),t=e.get(y);t.hasFocus()||t.focus();let{state:n,dispatch:r}=t,i=q(this,Z).active;if(!i)return;let a=i.$pos.pos+i.node.nodeSize,o=n.tr.insert(a,te.type(e).create());o=o.setSelection(h.near(o.doc.resolve(a))),r(o.scrollIntoView()),q(this,Z).hide(),e.get(K.key).show(o.selection.from)},Y(this,$,e);let n=document.createElement(`div`);n.classList.add(`milkdown-block-handle`);let r=a(it,{onAdd:this.onAdd,addIcon:t?.handleAddIcon??Le,handleIcon:t?.handleDragIcon??Fe});r.mount(n),Y(this,Q,r),Y(this,X,n);let i=t?.blockHandle??{};Y(this,Z,new be({ctx:e,content:n,getOffset:()=>16,getPlacement:({active:e,blockDom:t})=>{if(e.node.type.name===`heading`)return`left`;let n=0;e.node.descendants(e=>{n+=e.childCount});let r=e.el,i=r.getBoundingClientRect(),a=t.getBoundingClientRect(),o=window.getComputedStyle(r),s=Number.parseInt(o.paddingTop,10)||0,c=Number.parseInt(o.paddingBottom,10)||0,l=i.height-s-c,u=a.height;return n>2||u<l?`left-start`:`left`},...i})),this.update()}};X=new WeakMap,Z=new WeakMap,Q=new WeakMap,$=new WeakMap;function ct(e,t){e.set(O.key,{filterNodes:e=>!d(e=>[`table`,`blockquote`,`math_inline`].includes(e.type.name))(e)}),e.set(N.key,{view:()=>new st(e,t)})}var lt=(e,t)=>{e.config(we(P.BlockEdit)).config(e=>ct(e,t)).config(e=>tt(e,t)).use(K).use(N).use(et)};export{lt as blockEdit};