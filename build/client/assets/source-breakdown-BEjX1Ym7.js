import{r as c,j as t}from"./chunk-EPOLDU6W-CmigDcej.js";async function N(s){const r=await fetch("/api/posthog?type=query",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({query:{kind:"HogQLQuery",query:s}})});if(!r.ok)throw new Error(`PostHog ${r.status}`);return r.json()}const y=s=>s==="prod"?"AND properties.$host LIKE '%studojo.com%'":s==="staging"?"AND properties.$host LIKE '%studojo.pro%'":"";function j(s,r,a="all"){const n="toDate(timestamp + INTERVAL 330 MINUTE)";return`
    SELECT
      multiIf(
        medium = 'email' OR position(src_raw, 'email') > 0 OR position(src_raw, 'newsletter') > 0 OR position(ref, 'mail') > 0, 'Email',
        src_raw != '', src_raw,
        ref != '' AND ref != '$direct', ref,
        'Direct'
      ) AS source,
      count() AS visitors,
      countIf(signed_up) AS users
    FROM (
      SELECT person_id,
        lower(coalesce(any(person.properties.$initial_utm_medium), '')) AS medium,
        lower(coalesce(any(person.properties.$initial_utm_source), '')) AS src_raw,
        lower(coalesce(any(person.properties.$initial_referring_domain), '')) AS ref,
        max(person.properties.email != '' AND person.properties.email IS NOT NULL) AS signed_up
      FROM events
      WHERE ${s&&r?`${n} >= toDate('${s}') AND ${n} <= toDate('${r}')`:"1=1"} ${y(a)}
      GROUP BY person_id
    )
    GROUP BY source
    ORDER BY users DESC, visitors DESC
    LIMIT 15`}const x=s=>!s||s==="$direct"?"Direct":/^[a-z]+$/.test(s)?s.charAt(0).toUpperCase()+s.slice(1):s,h=["bg-violet-500","bg-sky-500","bg-emerald-500","bg-amber-500","bg-fuchsia-500","bg-rose-500","bg-cyan-500","bg-indigo-500","bg-lime-500","bg-orange-500"];function v({start:s,end:r,env:a="all",className:n=""}){const[o,f]=c.useState([]),[d,p]=c.useState(!0),[g,m]=c.useState(!1);c.useEffect(()=>{let e=!1;return p(!0),m(!1),N(j(s,r,a)).then(i=>{e||f((i.results??[]).map(u=>({source:u[0],visitors:+u[1]||0,users:+u[2]||0})))}).catch(()=>{e||m(!0)}).finally(()=>{e||p(!1)}),()=>{e=!0}},[s,r,a]);const l=o.reduce((e,i)=>e+i.users,0),b=Math.max(1,...o.map(e=>e.users));return t.jsxs("div",{className:`p-5 md:p-6 rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] ${n}`,children:[t.jsxs("div",{className:"flex items-baseline justify-between mb-1",children:[t.jsx("h2",{className:"font-['Clash_Display'] text-xl font-bold",children:"Where users come from"}),!d&&l>0&&t.jsxs("span",{className:"text-xs text-neutral-500",children:[l.toLocaleString()," signed-up users"]})]}),t.jsx("p",{className:"text-xs text-neutral-500 mb-4",children:"First-touch source of every signed-up user. Ranked by users."}),d?t.jsx("div",{className:"flex justify-center py-8",children:t.jsx("div",{className:"h-6 w-6 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent"})}):g?t.jsx("p",{className:"text-sm text-neutral-400 py-4",children:"Couldn't load source data."}):o.length===0?t.jsx("p",{className:"text-sm text-neutral-400 py-4",children:"No attribution data in this range."}):t.jsx("div",{className:"space-y-2",children:o.map((e,i)=>t.jsxs("div",{className:"flex items-center gap-3",children:[t.jsx("div",{className:"w-28 flex-shrink-0 text-sm font-semibold truncate",title:x(e.source),children:x(e.source)}),t.jsx("div",{className:"flex-1 h-7 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200",children:t.jsx("div",{className:`h-full ${h[i%h.length]} flex items-center px-2`,style:{width:`${Math.max(e.users/b*100,e.users>0?6:0)}%`},children:e.users>0&&t.jsx("span",{className:"text-xs font-bold text-white",children:e.users.toLocaleString()})})}),t.jsxs("div",{className:"w-24 text-right text-xs font-semibold text-neutral-500",children:[l>0?Math.round(e.users/l*100):0,"% · ",e.visitors.toLocaleString()," visits"]})]},e.source))})]})}export{v as S};
