const log = (msg, data = "") => console.log(`[KULMS-EXT] ${msg}`, data);

// ★ 追加: 締切までの時間から「共通の色」を返す関数
function getDeadlineColor(diffMs) {
  if (diffMs < 86400000) return '#ffdad9';       // 24時間以内（薄い赤）
  if (diffMs < 86400000*5) return '#fff4cc';      // 5日以内（薄い黄）
  if (diffMs < 86400000*14) return '#d4edda';     // 14日以内（薄い緑）
  return 'transparent';                          // それ以上は透明（白）
}

function waitForLectureTabs(subjectDeadline) {
  const observer = new MutationObserver(() => {
    const sites = document.querySelectorAll('.fav-sites-entry');
    if (sites.length > 0) {
      highlightLectureTabs(subjectDeadline);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function highlightLectureTabs(subjectDeadline) {
  const now = Date.now();
  document.querySelectorAll('.fav-sites-entry').forEach(site => {
    const btn = site.querySelector('.site-favorite-btn');
    if (!btn) return;
    const time = subjectDeadline[btn.dataset.siteId];
    if (!time) return;
    
    // ★ 修正: 共通の色判定関数を使用
    const diff = time - now;
    site.style.backgroundColor = getDeadlineColor(diff);
  });
}

async function main() {
  log("メイン処理を開始...");
  try {
    const nowTime = Date.now();
    const formatDate = (d) => d.toISOString().split("T")[0];

    const start = new Date(); start.setDate(start.getDate() - 7);
    const end = new Date(); end.setMonth(end.getMonth() + 4);
    const calUrl = `https://lms.gakusei.kyoto-u.ac.jp/direct/calendar/site/~me.json?merged=true&firstDate=${formatDate(start)}&lastDate=${formatDate(end)}`;
    
    const calRes = await fetch(calUrl, { credentials: "include" });
    const calData = await calRes.json();

    const siteNames = {}; 
    const targetSiteIds = new Set(); 

    (calData.calendar_collection || []).forEach(e => {
      if (e.siteId && e.siteName) {
        siteNames[e.siteId] = e.siteName.replace(/\[\d+.*?\]/, '');
      }
      if (e.firstTime && e.firstTime.time > nowTime && e.type === "Deadline") {
        targetSiteIds.add(e.siteId);
      }
    });

    const assignmentPromises = Array.from(targetSiteIds).map(siteId => 
      fetch(`https://lms.gakusei.kyoto-u.ac.jp/direct/assignment/site/${siteId}.json`, { credentials: "include" })
        .then(r => r.json())
        .catch(() => ({ assignment_collection: [] })) 
    );

    const sitesData = await Promise.all(assignmentPromises);
    
    let realAssignments = [];
    sitesData.forEach(data => {
      if (data.assignment_collection) {
        realAssignments.push(...data.assignment_collection);
      }
    });

    realAssignments = realAssignments.filter(a => {
      if (!a.dueTime || !a.dueTime.epochSecond) return false;
      return (a.dueTime.epochSecond * 1000) > nowTime;
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed', right: '0', top: '0', width: '350px', height: '100%',
      background: '#fff', borderLeft: '4px solid #0056b3', zIndex: '2147483647',
      overflowY: 'auto', fontSize: '13px', boxShadow: '-5px 0 15px rgba(0,0,0,0.3)',
      transform: 'translateX(100%)', transition: 'transform 0.3s ease-in-out',
      fontFamily: 'sans-serif'
    });
    const header = document.createElement('div');
    header.innerText = "課題一覧";
    Object.assign(header.style, { fontWeight: 'bold', padding: '22px', background: '#0056b3', color: '#fff' });
    panel.appendChild(header);

    realAssignments.sort((a, b) => a.dueTime.epochSecond - b.dueTime.epochSecond).forEach(d => {
      const dueTimeMs = d.dueTime.epochSecond * 1000;
      const diff = dueTimeMs - nowTime;
      
      let remaining = "";
      if (diff < 86400000) { 
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        remaining = `あと${hours}時間${minutes}分`;
      } else { 
        const days = Math.floor(diff / 86400000);
        remaining = `あと${days}日`;
      }

      const subjectName = siteNames[d.context] || "名称不明の科目";
      const taskTitle = d.title || "無題の課題";
      const taskUrl = d.entityURL ? d.entityURL.replace('/direct/assignment/', '/portal/site/' + d.context + '/tool-reset/') : "#";

      const item = document.createElement('a');
      item.href = taskUrl;
      item.target = "_blank";
      
      // ★ 修正: 共通の色判定関数を使用
      const bgColor = getDeadlineColor(diff);
      Object.assign(item.style, { 
        display: 'block', padding: '15px', borderBottom: '1px solid #eee', 
        textDecoration: 'none', color: 'inherit', cursor: 'pointer',
        background: bgColor
      });
      
      // ホバー時の透過処理（色がついている場合も綺麗に見えるように）
      item.onmouseover = () => item.style.opacity = '0.7';
      item.onmouseout = () => item.style.opacity = '1';

      const dateObj = new Date(dueTimeMs);
      const displayDate = `${dateObj.getMonth()+1}/${dateObj.getDate()} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;

      item.innerHTML = `
        <div style="font-size:0.75em; color:#0056b3; font-weight:bold; margin-bottom:4px;">${subjectName}</div>
        <div style="font-weight:bold; color:#333; line-height:1.4;">${taskTitle}</div>
        <div style="font-size:0.85em; color:#d9534f; margin-top:6px;">
          <span style="font-weight:bold;">締切: ${displayDate}</span> 
          <span style="margin-left:8px; background:#d9534f; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.9em;">${remaining}</span>
        </div>
      `;
      panel.appendChild(item);
    });

    const btn = document.createElement('button');
    btn.innerText = "📝 課題一覧";
    Object.assign(btn.style, {
      position: 'fixed', bottom: '30px', right: '30px', zIndex: '2147483647',
      padding: '14px 22px', background: '#0056b3', color: '#fff', borderRadius: '50px', 
      cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.3)', fontWeight: 'bold', border: 'none'
    });

    let open = false;
    btn.onclick = () => {
      open = !open;
      panel.style.transform = open ? 'translateX(0px)' : 'translateX(100%)';
      btn.innerText = open ? "✖ 閉じる" : "📝 課題一覧";
      btn.style.background = open ? '#444' : '#0056b3';
    };

    document.body.appendChild(panel);
    document.body.appendChild(btn);

    const subjectDeadline = {};
    realAssignments.forEach(d => {
      const dueTimeMs = d.dueTime.epochSecond * 1000;
      if (!subjectDeadline[d.context] || subjectDeadline[d.context] > dueTimeMs) {
        subjectDeadline[d.context] = dueTimeMs;
      }
    });
    waitForLectureTabs(subjectDeadline);

  } catch (e) { log("エラー:", e); }
}

if (document.readyState === "complete") main();
else window.addEventListener("load", main);