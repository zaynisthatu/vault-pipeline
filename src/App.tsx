import React, { useState, useEffect, useRef, useCallback } from "react";
import { Grid, List as ListIcon, Play, Heart, MessageCircle, Eye, ExternalLink, X,
         ChevronLeft, ChevronRight, Calendar, RotateCcw, Volume2, VolumeX } from "lucide-react";

interface Post { id:number; post_id:string; platform:string; username:string; nickname:string; caption:string; hashtags:string[]; likes:number; views:number; comments:number; music_title:string; music_author:string; categories:string[]; has_video:number; has_thumbnail:number; is_carousel:number; video_path:string; thumb_path:string; post_date:string; source_file:string; }
interface ScanStatus { status:string; indexed?:number; already?:number; total_dirs?:number; dirs_done?:number; elapsed?:string; total?:number; ts?:number; }

const path = { basename:(p:string)=>{ const s=p.replace(/\\/g,"/").split("/"); return s[s.length-1]||""; } };
function fmt(n:number){if(!n)return"0";if(n>=1e6)return(n/1e6).toFixed(1)+"M";if(n>=1e3)return(n/1e3).toFixed(1)+"K";return n.toString();}
function getUrl(p:Post){return p.platform==="instagram"?`https://instagram.com/p/${p.post_id}`:`https://tiktok.com/@${p.username}/video/${p.post_id}`;}
function dateLabel(d:string){if(!d)return"";try{return new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}catch{return d;}}

// ─── Hooks ────────────────────────────────────────────────────
function useComments(postId:string|null){
  const[comments,setComments]=useState<any[]>([]);
  const[loading,setLoading]=useState(false);
  useEffect(()=>{
    if(!postId){setComments([]);return;}
    setLoading(true);setComments([]);
    fetch(`/api/comments/${postId}`).then(r=>r.json()).then(d=>setComments(Array.isArray(d)?d:[])).catch(()=>setComments([])).finally(()=>setLoading(false));
  },[postId]);
  return{comments,loading};
}

function useCarousel(post:Post|null){
  const[images,setImages]=useState<string[]>([]);
  const[idx,setIdx]=useState(0);
  useEffect(()=>{
    setIdx(0);
    if(post?.is_carousel){fetch(`/api/carousel/${post.post_id}`).then(r=>r.json()).then(d=>setImages(d||[])).catch(()=>setImages([]));}
    else setImages([]);
  },[post?.post_id]);
  return{images,idx,setIdx};
}

// ─── Keyboard hook with stable callbacks (no stale closure) ──
function useKeyNav(handlers:{[key:string]:()=>void}){
  const ref=useRef(handlers);
  useEffect(()=>{ref.current=handlers;});
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      if((e.target as HTMLElement).tagName==="INPUT")return;
      const fn=ref.current[e.key];
      if(fn){e.preventDefault();fn();}
    };
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[]);
}

// ─── Scrollable filter row with prev/next buttons ─────────────
function ScrollRow({children,label}:{children:React.ReactNode;label:string}){
  const rowRef=useRef<HTMLDivElement>(null);
  const scroll=(d:number)=>rowRef.current?.scrollBy({left:d*160,behavior:"smooth"});
  return(
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-[#A1A1AA] font-bold tracking-wider shrink-0 w-10">{label}</span>
      <button onClick={()=>scroll(-1)} className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[#71717A] hover:text-white hover:bg-[#1D1D21] transition-colors"><ChevronLeft size={14}/></button>
      <div ref={rowRef} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 scroll-smooth">{children}</div>
      <button onClick={()=>scroll(1)}  className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[#71717A] hover:text-white hover:bg-[#1D1D21] transition-colors"><ChevronRight size={14}/></button>
    </div>
  );
}

// ─── Filter pill ──────────────────────────────────────────────
function Pill({active,onClick,children}:{active:boolean;onClick:()=>void;children:React.ReactNode}){
  return(
    <button onClick={onClick} className={`px-3 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 border transition-colors ${active?"bg-[#1D1D21] text-[#10B981] border-[#1D1D21] font-bold":"border-transparent text-[#A1A1AA] hover:bg-[#1D1D21] hover:text-white"}`}>
      {children}
    </button>
  );
}

// ─── Comment components ───────────────────────────────────────
function CommentItem({c}:{c:{user:string;text:string;likes:number}}){
  return(
    <div className="flex gap-2.5 py-2.5 border-b border-[#1D1D21] last:border-0">
      <div className="w-7 h-7 rounded-full bg-[#1D1D21] border border-[#27272A] flex items-center justify-center text-[10px] font-bold text-[#A1A1AA] shrink-0 uppercase">{c.user?.[0]||"?"}</div>
      <div className="flex-1 min-w-0">
        <span className="text-[12px] font-semibold text-[#10B981]">@{c.user} </span>
        <span className="text-[12px] text-[#D4D4D8] break-words">{c.text}</span>
        {c.likes>0&&<div className="text-[10px] text-[#71717A] mt-0.5">♡ {fmt(c.likes)}</div>}
      </div>
    </div>
  );
}
function CommentsSection({postId}:{postId:string}){
  const{comments,loading}=useComments(postId);
  return(
    <div>
      <div className="text-[10px] uppercase font-bold text-[#71717A] tracking-widest mb-3 flex items-center gap-2">
        <MessageCircle size={11}/> Comments
        {comments.length>0&&<span className="bg-[#1D1D21] text-[#10B981] px-2 py-0.5 rounded-full font-mono text-[9px]">{comments.length}</span>}
      </div>
      {loading?<div className="text-[11px] text-[#71717A] font-mono py-3 text-center">Loading…</div>
      :comments.length>0?<div className="max-h-[300px] overflow-y-auto custom-scrollbar pr-1">{comments.map((c,i)=><CommentItem key={i} c={c}/>)}</div>
      :<div className="text-[11px] text-[#71717A] font-mono italic py-2">No comments saved</div>}
    </div>
  );
}

// ─── Carousel/media pane ──────────────────────────────────────
function CarouselPane({post,size}:{post:Post;size:"sm"|"lg"}){
  const{images,idx,setIdx}=useCarousel(post);
  const lg=size==="lg";
  const wrap=lg?"flex-1 relative flex items-center justify-center bg-black border-r border-[#27272A] group":"w-[320px] shrink-0 bg-black flex items-center justify-center relative border-r border-[#27272A] group";
  const imgCls=lg?"max-w-full max-h-full object-contain":"w-full h-full object-cover";
  const src=(i:number)=>images[i]?.startsWith("http")?images[i]:`/carousel/${post.post_id}/${images[i]}`;
  if(post.has_video)return(<div className={wrap}><video src={`/video/${post.id}`} autoPlay loop playsInline controls={lg} className={lg?"max-w-full max-h-full object-contain":"w-full h-full object-cover"}/></div>);
  if(images.length>0)return(
    <div className={wrap}>
      <img src={src(idx)} className={imgCls} alt=""/>
      {idx>0&&<button className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity z-10" onClick={e=>{e.stopPropagation();setIdx(i=>i-1);}}><ChevronLeft size={lg?20:16}/></button>}
      {idx<images.length-1&&<button className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity z-10" onClick={e=>{e.stopPropagation();setIdx(i=>i+1);}}><ChevronRight size={lg?20:16}/></button>}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 bg-black/40 px-2 py-1 rounded-full">
        {images.map((_,i)=><div key={i} className={`w-1.5 h-1.5 rounded-full ${i===idx?"bg-white":"bg-white/30"}`}/>)}
      </div>
    </div>
  );
  return<div className={wrap}><img src={`/thumb/${post.id}`} className={imgCls} alt=""/></div>;
}

// ─── Post info panel ──────────────────────────────────────────
function PostInfoPanel({post,size="sm"}:{post:Post;size?:"sm"|"lg"}){
  const srcLabel=post.source_file?path.basename(post.source_file):"";
  const lg=size==="lg";
  return(
    <div className={`${lg?"w-[360px]":"flex-1"} bg-[#111113] flex flex-col`}>
      <div className="flex items-center gap-3 p-4 border-b border-[#27272A] shrink-0">
        <div className="w-9 h-9 rounded-full bg-[#1D1D21] flex items-center justify-center text-sm font-bold text-[#E2E8F0]">{post.username?.[0]?.toUpperCase()}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[#F4F4F5] truncate">@{post.username}</div>
          <div className="text-[9px] text-[#71717A] tracking-widest font-mono">{post.platform?.toUpperCase()}</div>
        </div>
        <a href={getUrl(post)} target="_blank" rel="noreferrer" className="text-[11px] text-[#A1A1AA] border border-[#27272A] px-2.5 py-1 rounded-lg hover:text-white hover:bg-[#1D1D21] transition-colors shrink-0">↗</a>
      </div>
      <div className="grid grid-cols-3 gap-px bg-[#27272A] border-b border-[#27272A] shrink-0">
        {[{l:"Views",v:post.views,i:<Eye size={10}/>},{l:"Likes",v:post.likes,i:<Heart size={10}/>},{l:"Cmts",v:post.comments,i:<MessageCircle size={10}/>}].map(s=>(
          <div key={s.l} className="bg-[#111113] p-2.5 text-center">
            <div className="font-mono font-bold text-[13px] text-[#E2E8F0] mb-0.5">{fmt(s.v)}</div>
            <div className="text-[8px] text-[#A1A1AA] uppercase tracking-widest flex items-center justify-center gap-0.5">{s.i}{s.l}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-4 pt-3 pb-2 border-b border-[#1D1D21] space-y-1">
          {post.post_date&&<div className="flex items-center gap-2"><Calendar size={10} className="text-[#71717A] shrink-0"/><span className="text-[11px] text-[#A1A1AA] font-mono">{dateLabel(post.post_date)}</span></div>}
          <div className="flex items-start gap-2"><span className="text-[9px] text-[#71717A] font-mono shrink-0 pt-0.5">ID</span><span className="text-[11px] text-[#D4D4D8] font-mono break-all">{post.post_id}</span></div>
          {srcLabel&&<div className="flex items-start gap-2" title={post.source_file}><span className="text-[9px] text-[#71717A] font-mono shrink-0 pt-0.5">FILE</span><span className="text-[10px] text-[#52525B] font-mono break-all leading-tight">{srcLabel}</span></div>}
        </div>
        {post.caption&&<div className="p-4 border-b border-[#1D1D21]"><div className="text-[10px] text-[#71717A] uppercase font-bold tracking-widest mb-1.5">Caption</div><p className="text-[12px] text-[#D4D4D8] leading-relaxed whitespace-pre-wrap">{post.caption}</p></div>}
        {post.music_title&&<div className="px-4 py-3 border-b border-[#1D1D21] flex items-center gap-2"><span className="text-[#10B981] font-mono">♪</span><div className="min-w-0"><div className="text-[11px] text-[#D4D4D8] font-medium truncate">{post.music_title}</div>{post.music_author&&<div className="text-[10px] text-[#71717A] truncate">{post.music_author}</div>}</div></div>}
        {post.categories?.length>0&&<div className="px-4 py-3 border-b border-[#1D1D21]"><div className="text-[10px] text-[#71717A] uppercase font-bold tracking-widest mb-2">Categories</div><div className="flex flex-wrap gap-1.5">{post.categories.map((c:string)=><span key={c} className="px-2 py-0.5 bg-[#1D1D21] border border-[#27272A] rounded text-[9px] font-mono font-bold text-[#10B981] uppercase tracking-wider">{c.replace(/_/g," ")}</span>)}</div></div>}
        <div className="px-4 py-4"><CommentsSection postId={post.post_id}/></div>
      </div>
    </div>
  );
}

// ─── Scan banner ──────────────────────────────────────────────
function ScanBanner({onDismiss}:{onDismiss:()=>void}){
  const[s,setS]=useState<ScanStatus>({status:"idle"});
  useEffect(()=>{const p=()=>fetch("/api/scan-status").then(r=>r.json()).then(setS).catch(()=>{});p();const t=setInterval(p,2000);return()=>clearInterval(t);},[]);
  if(s.status==="idle"||s.status==="done")return null;
  const pct=s.total_dirs&&s.dirs_done?Math.round((s.dirs_done/s.total_dirs)*100):0;
  return(
    <div className="shrink-0 bg-[#0D2818] border-b border-[#10B981]/30 px-6 py-2 flex items-center gap-4">
      <div className="flex-1">
        <div className="flex justify-between text-[11px] font-mono mb-1">
          <span className="text-[#10B981] font-bold">⚡ INDEXING</span>
          <span className="text-[#71717A]">{pct}% • {fmt(s.indexed||0)} indexed</span>
        </div>
        <div className="h-1.5 bg-[#1D1D21] rounded-full overflow-hidden"><div className="h-full bg-[#10B981] transition-all duration-500 rounded-full" style={{width:`${pct}%`}}/></div>
      </div>
      <button onClick={onDismiss} className="text-[#71717A] hover:text-white"><X size={14}/></button>
    </div>
  );
}

// ─── Stats bar ────────────────────────────────────────────────
function StatsBar({total,stats}:{total:number;stats:any}){
  if(!stats)return null;
  return(
    <div className="shrink-0 bg-[#0A0A0B] border-b border-[#1D1D21] px-8 py-2 flex items-center gap-5 text-[11px] font-mono overflow-x-auto no-scrollbar">
      <span className="text-[#10B981] font-bold">{total.toLocaleString()} POSTS</span>
      <span className="text-[#333]">|</span>
      <span className="text-[#71717A]">IG <span className="text-[#D4D4D8]">{fmt(stats.instagram||0)}</span></span>
      <span className="text-[#71717A]">TT <span className="text-[#D4D4D8]">{fmt(stats.tiktok||0)}</span></span>
      <span className="text-[#71717A]">Videos <span className="text-[#D4D4D8]">{fmt(stats.videos||0)}</span></span>
      <span className="text-[#71717A]">Carousels <span className="text-[#D4D4D8]">{fmt(stats.carousels||0)}</span></span>
      <span className="text-[#333]">|</span>
      <span className="text-[#71717A]">❤ <span className="text-[#D4D4D8]">{fmt(stats.total_likes||0)}</span></span>
      <span className="text-[#71717A]">▶ <span className="text-[#D4D4D8]">{fmt(stats.total_views||0)}</span></span>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────
const SORTS=[
  {v:"likes",   l:"Top Liked",      icon:"♥"},
  {v:"views",   l:"Most Viewed",    icon:"▶"},
  {v:"comments",l:"Most Commented", icon:"💬"},
  {v:"recent",  l:"Newest First",   icon:"↓"},
  {v:"oldest",  l:"Oldest First",   icon:"↑"},
  {v:"alpha",   l:"A–Z",            icon:"Az"},
  {v:"random",  l:"Random",         icon:"⟳"},
];
const CATS=["all","gym","car_edit","anime","couple","dance","meme","looksmax","movie_edit","music","fashion","aesthetic","motivation","travel","food","gaming"];

export default function App(){
  const[view,    setView]   =useState<"feed"|"grid">("grid");
  const[posts,   setPosts]  =useState<Post[]>([]);
  const[loading, setLoading]=useState(false);
  const[page,    setPage]   =useState(1);
  const[hasMore, setHasMore]=useState(true);
  const[total,   setTotal]  =useState(0);
  const[stats,   setStats]  =useState<any>(null);
  const[years,   setYears]  =useState<{yr:string;cnt:number}[]>([]);
  const[dbError, setDbError]=useState(false);
  const[showScan,setShowScan]=useState(true);

  const[platform,setPlatform]=useState("all");
  const[category,setCategory]=useState("all");
  const[search,  setSearch]  =useState("");
  const[sort,    setSort]    =useState("likes");
  const[year,    setYear]    =useState("");

  const[modalIdx,      setModalIdx]      =useState<number|null>(null);
  const[gridSliderIdx, setGridSliderIdx] =useState<number|null>(null);

  const isFiltered = platform!=="all"||category!=="all"||year!==""||sort!=="likes"||search!=="";

  const resetFilters=()=>{setPlatform("all");setCategory("all");setYear("");setSort("likes");setSearch("");};

  const observer=useRef<IntersectionObserver|null>(null);
  const lastRef=useCallback((node:any)=>{
    if(loading)return;
    if(observer.current)observer.current.disconnect();
    observer.current=new IntersectionObserver(entries=>{if(entries[0].isIntersecting&&hasMore)setPage(p=>p+1);});
    if(node)observer.current.observe(node);
  },[loading,hasMore]);

  const loadPosts=async(reset=false,p=page)=>{
    if(loading)return;setLoading(true);
    try{
      const q=new URLSearchParams({page:String(p),limit:"30",platform:platform==="all"?"":platform,q:search,sort});
      if(category!=="all")q.set("category",category);
      if(year)q.set("year",year);
      const res=await fetch(`/api/posts?${q}`);
      if(!res.ok){if(res.status===503)setDbError(true);throw new Error("Failed");}
      const data=await res.json();
      setPosts(prev=>reset?data.posts:[...prev,...data.posts]);
      setHasMore(p<data.pages);setTotal(data.total);setDbError(false);
    }catch(err){console.error(err);}finally{setLoading(false);}
  };

  useEffect(()=>{loadPosts(true,1);setPage(1);},[platform,category,search,sort,year]);
  useEffect(()=>{if(page>1)loadPosts(false,page);},[page]);
  useEffect(()=>{
    fetch("/api/stats").then(r=>r.json()).then(setStats).catch(()=>{});
    fetch("/api/years").then(r=>r.json()).then(setYears).catch(()=>{});
  },[]);

  // Global keyboard nav (only when no modal open, for feed/grid arrow navigation)
  useKeyNav({
    ArrowRight: ()=>{
      if(gridSliderIdx!==null){
        const next=Math.min(posts.length-1,gridSliderIdx+1);
        if(gridSliderIdx+1===posts.length&&hasMore&&!loading)setPage(p=>p+1);
        setGridSliderIdx(next);
      } else if(modalIdx!==null){
        setModalIdx(Math.min(posts.length-1,modalIdx+1));
      }
    },
    ArrowLeft: ()=>{
      if(gridSliderIdx!==null) setGridSliderIdx(Math.max(0,gridSliderIdx-1));
      else if(modalIdx!==null)  setModalIdx(Math.max(0,modalIdx-1));
    },
    Escape: ()=>{
      if(gridSliderIdx!==null)setGridSliderIdx(null);
      else if(modalIdx!==null)setModalIdx(null);
    },
  });

  if(dbError)return(
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0A0A0B] text-[#E2E8F0] p-8 text-center font-mono">
      <div className="text-[#10B981] text-xl mb-4">⚠ Database Not Found</div>
      <p className="mb-4 text-[#71717A] text-sm">Run the indexer first:</p>
      <code className="bg-[#18181B] border border-[#27272A] p-4 rounded text-sm">npx tsx src/indexer.ts --folder "C:\Your\Folder"</code>
    </div>
  );

  return(
    <div className="flex flex-col h-screen bg-[#0A0A0B] text-[#E2E8F0] overflow-hidden font-sans">

      {/* ── Header ── */}
      <header className="h-[56px] shrink-0 bg-[#0A0A0B] border-b border-[#27272A] flex items-center px-5 gap-3 z-50">
        <div className="font-mono text-xl font-bold tracking-[4px] text-[#10B981]">VAULT</div>
        <div className="flex-1 max-w-xs">
          <input type="text" className="w-full bg-[#18181B] border border-[#27272A] rounded-md px-3 py-1.5 text-[13px] outline-none focus:border-[#71717A] placeholder:text-[#A1A1AA] text-[#D4D4D8]" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        {/* Reset all filters button */}
        {isFiltered&&(
          <button onClick={resetFilters} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#EF4444]/40 text-[#EF4444] text-[11px] font-semibold hover:bg-[#EF4444]/10 transition-colors shrink-0">
            <RotateCcw size={12}/> Reset
          </button>
        )}

        <div className="flex gap-1 ml-auto">
          {[{v:"feed",l:"Feed",i:<ListIcon size={14}/>},{v:"grid",l:"Grid",i:<Grid size={14}/>}].map(({v,l,i})=>(
            <button key={v} onClick={()=>setView(v as "feed"|"grid")} className={`px-3 py-1.5 text-[12px] rounded-lg border flex items-center gap-1.5 transition-colors ${view===v?"bg-[#1D1D21] border-[#1D1D21] text-[#10B981] font-semibold":"border-transparent text-[#A1A1AA] hover:bg-[#1D1D21] hover:text-white"}`}>{i}{l}</button>
          ))}
        </div>
      </header>

      <StatsBar total={total} stats={stats}/>
      {showScan&&<ScanBanner onDismiss={()=>setShowScan(false)}/>}

      {/* ── Filter bar ── */}
      <div className="shrink-0 bg-[#111113] border-b border-[#27272A] px-3 py-2 flex flex-col gap-1.5 z-40">

        {/* Row 1: Platform + Sort */}
        <ScrollRow label="PLT">
          {["all","instagram","tiktok"].map(p=>(
            <Pill key={p} active={platform===p} onClick={()=>setPlatform(p)}>{p==="all"?"All":p==="tiktok"?"TikTok":"Instagram"}</Pill>
          ))}
          <div className="w-px h-4 bg-[#27272A] mx-0.5 shrink-0"/>
          <span className="text-[10px] text-[#A1A1AA] font-bold tracking-wider shrink-0">SORT</span>
          {SORTS.map(s=>(
            <Pill key={s.v} active={sort===s.v} onClick={()=>setSort(s.v)}>{s.icon} {s.l}</Pill>
          ))}
        </ScrollRow>

        {/* Row 2: Category + Year */}
        <ScrollRow label="CAT">
          {CATS.map(c=>(
            <Pill key={c} active={category===c} onClick={()=>setCategory(c===category&&c!=="all"?"all":c)}>
              {c==="all"?"All":c.replace("_"," ")}
            </Pill>
          ))}
          {years.length>0&&<>
            <div className="w-px h-4 bg-[#27272A] mx-0.5 shrink-0"/>
            <span className="text-[10px] text-[#A1A1AA] font-bold tracking-wider shrink-0">YR</span>
            {years.map(({yr,cnt})=>(
              <Pill key={yr} active={year===yr} onClick={()=>setYear(year===yr?"":yr)}>
                {yr} <span className="opacity-50 text-[9px]">{fmt(cnt)}</span>
              </Pill>
            ))}
          </>}
        </ScrollRow>

      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {view==="feed"&&(
          <div className="flex-1 overflow-y-auto snap-y snap-mandatory no-scrollbar">
            {posts.map((post,idx)=>(
              <FeedItem ref={posts.length===idx+1?lastRef:null} key={post.id} post={post} onOpenModal={()=>setModalIdx(idx)}/>
            ))}
            {loading&&<div className="text-center p-8 text-[#444] text-xs font-mono">Loading…</div>}
            {!loading&&posts.length===0&&<div className="text-center p-16 text-[#444] text-sm font-mono">Nothing found</div>}
          </div>
        )}
        {view==="grid"&&(
          <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
            <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-2 space-y-2">
              {posts.map((post,idx)=>(
                <GridItem ref={posts.length===idx+1?lastRef:null} key={post.id} post={post} onOpen={()=>setGridSliderIdx(idx)}/>
              ))}
            </div>
            {loading&&<div className="text-center p-8 text-[#444] text-xs font-mono">Loading…</div>}
            {!loading&&posts.length===0&&<div className="text-center p-16 text-[#444] text-sm font-mono">Nothing found</div>}
          </div>
        )}
      </div>

      {/* ── Overlays ── */}
      {modalIdx!==null&&(
        <Modal post={posts[modalIdx]} onClose={()=>setModalIdx(null)}
          onNext={()=>setModalIdx(Math.min(posts.length-1,modalIdx+1))}
          onPrev={()=>setModalIdx(Math.max(0,modalIdx-1))}/>
      )}
      {gridSliderIdx!==null&&(
        <GridSlider post={posts[gridSliderIdx]} idx={gridSliderIdx} total={posts.length}
          onClose={()=>setGridSliderIdx(null)}
          onNext={()=>{ if(gridSliderIdx+1===posts.length&&hasMore&&!loading)setPage(p=>p+1); setGridSliderIdx(Math.min(posts.length-1,gridSliderIdx+1)); }}
          onPrev={()=>setGridSliderIdx(Math.max(0,gridSliderIdx-1))}/>
      )}
    </div>
  );
}

// ─── FeedItem — with working audio toggle ─────────────────────
const FeedItem=React.forwardRef<HTMLDivElement,{post:Post;onOpenModal:()=>void}>(({post,onOpenModal},ref)=>{
  const[playing,setPlaying]=useState(false);
  const[muted,  setMuted]  =useState(true);   // start muted for autoplay
  const vRef=useRef<HTMLVideoElement>(null);
  const cRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!vRef.current||!cRef.current)return;
    const obs=new IntersectionObserver(entries=>entries.forEach(e=>{
      if(e.isIntersecting&&e.intersectionRatio>=0.5)vRef.current?.play().then(()=>setPlaying(true)).catch(()=>{});
      else{vRef.current?.pause();setPlaying(false);setMuted(true);} // re-mute on scroll away
    }),{threshold:0.5});
    obs.observe(cRef.current);return()=>obs.disconnect();
  },[]);

  const handleClick=(e:React.MouseEvent)=>{
    if((e.target as HTMLElement).closest(".action-btn"))return;
    if(!post.has_video){onOpenModal();return;}
    if(vRef.current){
      if(vRef.current.paused)vRef.current.play().then(()=>setPlaying(true)).catch(()=>{});
      else{vRef.current.pause();setPlaying(false);}
    }
  };

  return(
    <div ref={el=>{if(typeof ref==="function")ref(el);else if(ref)(ref as any).current=el;(cRef as any).current=el;}}
      className="snap-start h-full relative bg-[#0A0A0B] flex items-center justify-center cursor-pointer" onClick={handleClick}>
      <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
        {post.has_video
          ? <video ref={vRef} src={`/video/${post.id}`} loop playsInline muted={muted} className="w-full h-full object-contain bg-black"/>
          : <img src={`/thumb/${post.id}`} loading="lazy" className="w-full h-full object-contain bg-black" alt=""/>
        }
      </div>
      {!playing&&post.has_video&&<div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"><Play size={64} className="text-white opacity-70 fill-white"/></div>}

      {/* Platform badge */}
      <div className="absolute top-4 right-4 z-20 px-2 py-1 rounded bg-[rgba(16,185,129,0.2)] text-[#10B981] text-[10px] font-bold tracking-wider uppercase backdrop-blur-md">{post.platform==="tiktok"?"TT":"IG"}</div>

      {/* 🔇/🔊 mute toggle — only for videos */}
      {post.has_video&&(
        <button className="action-btn absolute top-4 left-4 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
          onClick={e=>{e.stopPropagation();setMuted(m=>!m);}}>
          {muted?<VolumeX size={16}/>:<Volume2 size={16}/>}
        </button>
      )}

      {/* Caption overlay */}
      <div className="absolute bottom-0 left-0 right-[60px] bg-gradient-to-t from-black via-black/60 to-transparent pt-16 pb-6 px-6 z-20 pointer-events-none">
        <div className="font-semibold text-[15px] text-[#F4F4F5]">@{post.username}</div>
        {post.caption&&<div className="text-[13px] text-[#D4D4D8] mt-2 line-clamp-2 w-fit pointer-events-auto hover:line-clamp-none leading-relaxed">{post.caption}</div>}
        {post.music_title&&<div className="text-[11px] text-[#A1A1AA] mt-2">♪ {post.music_title}{post.music_author?` — ${post.music_author}`:""}</div>}
      </div>

      {/* Right action buttons */}
      <div className="absolute right-4 bottom-24 flex flex-col items-center gap-5 z-30 action-btn">
        <div className="w-10 h-10 rounded-full bg-[#111113] border border-[#27272A] flex items-center justify-center text-sm font-bold text-[#E2E8F0] uppercase cursor-pointer mb-2 hover:bg-[#1D1D21]" onClick={onOpenModal}>{post.username?.[0]||"?"}</div>
        <Fab icon={<Heart size={18} className={post.likes>0?"fill-[#10B981] text-[#10B981]":""}/>} label={fmt(post.likes)} onClick={onOpenModal}/>
        <Fab icon={<MessageCircle size={18}/>} label={fmt(post.comments)} onClick={onOpenModal}/>
        <Fab icon={<Eye size={18}/>} label={fmt(post.views)} onClick={onOpenModal}/>
        <Fab icon={<ExternalLink size={18}/>} label="Open" onClick={()=>window.open(getUrl(post),"_blank")}/>
      </div>
    </div>
  );
});

function Fab({icon,label,onClick}:{icon:React.ReactNode;label:string;onClick?:()=>void}){
  return(
    <div className="flex flex-col items-center gap-1.5 cursor-pointer group" onClick={onClick}>
      <div className="w-10 h-10 rounded-full bg-[#18181B] border border-[#27272A] flex items-center justify-center text-[#A1A1AA] group-hover:bg-[#1D1D21] group-hover:text-[#F4F4F5] transition-colors">{icon}</div>
      <div className="text-[10px] text-[#71717A] font-medium tracking-wide uppercase">{label}</div>
    </div>
  );
}

// ─── GridItem ─────────────────────────────────────────────────
const GridItem=React.forwardRef<HTMLDivElement,{post:Post;onOpen:()=>void}>(({post,onOpen},ref)=>{
  const srcLabel=post.source_file?path.basename(post.source_file).replace(/\.[^.]+$/,"").slice(0,55):"";
  return(
    <div ref={ref} className="break-inside-avoid relative rounded-xl overflow-hidden bg-[#18181B] border border-[#27272A] cursor-pointer group transition-transform hover:-translate-y-0.5 hover:border-[#10B981]" onClick={onOpen}>
      <img src={`/thumb/${post.id}`} loading="lazy" className="w-full object-cover min-h-[130px] bg-[#18181B]" alt="" onError={e=>(e.currentTarget.style.background="#18181B")}/>
      <div className={`absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-[#10B981] ${post.platform==="tiktok"?"shadow-[0_0_8px_#10B981]":""}`}/>
      <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
        <span className="bg-black/60 text-[#A1A1AA] px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest font-mono backdrop-blur-sm">{post.platform==="tiktok"?"TT":"IG"}</span>
        {post.is_carousel===1&&<span className="bg-[rgba(16,185,129,0.2)] text-[#10B981] rounded px-1.5 py-0.5 text-[9px] font-bold font-mono">⊞</span>}
        {post.has_video===1&&!post.is_carousel&&<span className="text-[10px] text-[#A1A1AA] bg-black/60 px-1 py-0.5 rounded font-mono">▶</span>}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5 pointer-events-none">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[12px] font-semibold text-[#F4F4F5] truncate">@{post.username}</span>
          <span className="text-[9px] text-[#10B981] font-mono font-bold shrink-0">{post.platform==="tiktok"?"TT":"IG"}</span>
        </div>
        {post.post_date&&<div className="flex items-center gap-1 mb-1"><Calendar size={9} className="text-[#71717A] shrink-0"/><span className="text-[10px] text-[#A1A1AA] font-mono">{dateLabel(post.post_date)}</span></div>}
        <div className="text-[9px] text-[#71717A] font-mono truncate mb-1">ID: {post.post_id}</div>
        {srcLabel&&<div className="text-[9px] text-[#52525B] font-mono truncate leading-tight" title={post.source_file}>{srcLabel}</div>}
        <div className="flex items-center gap-2 mt-1.5">
          {post.likes>0&&<span className="text-[10px] text-[#D4D4D8] flex items-center gap-0.5"><Heart size={9} className="fill-[#10B981] text-[#10B981]"/>{fmt(post.likes)}</span>}
          {post.views>0&&<span className="text-[10px] text-[#D4D4D8] flex items-center gap-0.5"><Eye size={9}/>{fmt(post.views)}</span>}
          {post.comments>0&&<span className="text-[10px] text-[#D4D4D8] flex items-center gap-0.5"><MessageCircle size={9}/>{fmt(post.comments)}</span>}
        </div>
      </div>
    </div>
  );
});

// ─── Modal ────────────────────────────────────────────────────
function Modal({post,onClose,onNext,onPrev}:{post:Post;onClose:()=>void;onNext:()=>void;onPrev:()=>void}){
  if(!post)return null;
  return(
    <div className="fixed inset-0 bg-[#0A0A0B]/90 backdrop-blur z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#111113] border border-[#27272A] rounded-xl w-full max-w-4xl max-h-[90vh] flex overflow-hidden shadow-2xl relative" onClick={e=>e.stopPropagation()}>
        <button className="absolute top-3 right-3 z-50 w-8 h-8 flex items-center justify-center rounded-full bg-[#18181B] border border-[#27272A] text-[#A1A1AA] hover:text-white" onClick={onClose}><X size={16}/></button>
        <CarouselPane post={post} size="sm"/>
        <PostInfoPanel post={post}/>
      </div>
    </div>
  );
}

// ─── GridSlider — keyboard nav fixed with useKeyNav hook ──────
function GridSlider({post,idx,total,onClose,onNext,onPrev}:{post:Post;idx:number;total:number;onClose:()=>void;onNext:()=>void;onPrev:()=>void}){
  if(!post)return null;
  return(
    <div className="fixed inset-0 bg-[#0A0A0B]/95 backdrop-blur-md z-[100] flex items-center justify-center" onClick={onClose}>
      {/* Counter */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-[#18181B] border border-[#27272A] rounded-full px-4 py-1 font-mono text-[11px] font-bold tracking-widest text-[#A1A1AA] z-10">
        {idx+1} / {total}
      </div>

      {/* Close */}
      <button className="absolute top-5 right-5 bg-[#18181B] border border-[#27272A] rounded-full w-10 h-10 flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-[#1D1D21] z-10" onClick={onClose}><X size={18}/></button>

      {/* Prev arrow */}
      <button
        className="absolute left-4 top-1/2 -translate-y-1/2 bg-[#18181B] border border-[#27272A] hover:bg-[#1D1D21] rounded-full w-12 h-12 flex items-center justify-center text-[#A1A1AA] hover:text-white z-10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
        onClick={e=>{e.stopPropagation();onPrev();}}
        disabled={idx===0}
      ><ChevronLeft size={24}/></button>

      {/* Next arrow */}
      <button
        className="absolute right-4 top-1/2 -translate-y-1/2 bg-[#18181B] border border-[#27272A] hover:bg-[#1D1D21] rounded-full w-12 h-12 flex items-center justify-center text-[#A1A1AA] hover:text-white z-10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
        onClick={e=>{e.stopPropagation();onNext();}}
        disabled={idx===total-1}
      ><ChevronRight size={24}/></button>

      {/* Content */}
      <div className="w-[60vw] min-w-[320px] h-[86vh] flex bg-[#18181B] rounded-xl border border-[#27272A] overflow-hidden shadow-2xl" onClick={e=>e.stopPropagation()}>
        <CarouselPane post={post} size="lg"/>
        <PostInfoPanel post={post} size="lg"/>
      </div>
    </div>
  );
}
