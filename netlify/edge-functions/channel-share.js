const FIREBASE_PROJECT_ID = "alrayan-15db4";
const FIREBASE_API_KEY = "AIzaSyC7-MKB7Ix3k0gA7tGxCXNFaty5IQ-U3Xg";
const SITE_LOGO = "https://alrayanmarket.netlify.app/icon-512.png";
const BOT = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot|Pinterest|redditbot|vkShare|Skype|Viber|Googlebot/i;
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function ytId(url){const m=(url||"").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);return m?m[1]:"";}
async function fireGet(col,id){
  const u=`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${col}/${id}?key=${FIREBASE_API_KEY}`;
  const r=await fetch(u); if(!r.ok)return null; return r.json();
}
export default async (request, context) => {
  const ua=request.headers.get("user-agent")||"";
  const url=new URL(request.url);
  const vid=url.searchParams.get("video");
  const poll=url.searchParams.get("poll");
  if((!vid&&!poll)||!BOT.test(ua)) return context.next();
  let title="قناة الريان", desc="فيديوهات واستطلاعات ممتعة على منصة الريان", image=SITE_LOGO;
  try{
    if(vid){
      const d=await fireGet("entVideos",vid);
      const f=d&&d.fields||{};
      title=f.title?.stringValue||"فيديو على قناة الريان";
      desc="شاهد الآن على قناة الريان 🎥";
      const yid=ytId(f.url?.stringValue||"");
      if(yid) image=`https://i.ytimg.com/vi/${yid}/hqdefault.jpg`;
    }else if(poll){
      const d=await fireGet("entPredicts",poll);
      const f=d&&d.fields||{};
      title=f.title?.stringValue||"استطلاع على قناة الريان";
      desc=f.sub?.stringValue||"شارك برأيك في استطلاع الريان 📊";
      image=SITE_LOGO;
    }
  }catch(e){ return context.next(); }
  const res=await context.next();
  let html=await res.text();
  const sT=esc(title), sD=esc(desc), sI=esc(image);
  html=html.replace(/<title>.*?<\/title>/,`<title>${sT}</title>`);
  html=html.replace(/<meta property="og:title" content=".*?">/,`<meta property="og:title" content="${sT}">`);
  html=html.replace(/<meta property="og:description" content=".*?">/,`<meta property="og:description" content="${sD}">`);
  html=html.replace(/<meta property="og:image" content=".*?">/,`<meta property="og:image" content="${sI}">`);
  return new Response(html,{status:res.status,headers:res.headers});
};
export const config = { path: "/" };
