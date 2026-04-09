// ① 講義タブのDOM追加を監視する関数
function waitForLectureTabs(subjectDeadline) {
  const observer = new MutationObserver(() => {
    const sites = document.querySelectorAll('.fav-sites-entry');
    if (sites.length > 0) {
      highlightLectureTabs(subjectDeadline);
      observer.disconnect(); // 一度実行したら監視を停止
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// ② 講義タブの色を変更する関数
function highlightLectureTabs(subjectDeadline) {
  const sites = document.querySelectorAll('.fav-sites-entry');

  sites.forEach(site => {
    const button = site.querySelector('.site-favorite-btn');
    if (!button) return;

    const siteId = button.dataset.siteId;
    const deadlineTime = subjectDeadline[siteId];
    if (!deadlineTime) return;

    const diff = deadlineTime - Date.now();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    // 色の設定
    if (days <= 1) {
      site.style.backgroundColor = '#d9534f'; // 濃い赤
      site.style.color = '#fff';
    } else if (days <= 3) {
      site.style.backgroundColor = '#f0ad4e'; // オレンジ
    } else if (days <= 7) {
      site.style.backgroundColor = '#fff3cd'; // 薄い黄色
    }

    // ツールチップに締切日時を表示
    site.title = `締切: ${new Date(deadlineTime).toLocaleString()}`;
  });
}

// ③ メイン処理
async function main() {
  try {
    // [1] 課題取得
    const notifRes = await fetch(
      "https://lms.gakusei.kyoto-u.ac.jp/api/users/me/notifications",
      { credentials: "include" }
    );
    const notifications = await notifRes.json();

    const assignments = notifications.filter(e =>
      e.event && e.event.includes("assignment")
    );

    // [2] カレンダー取得
    function formatDate(d) {
      return d.toISOString().split("T")[0];
    }

    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 1);
    const end = new Date(now);
    end.setMonth(now.getMonth() + 3);

    const calendarUrl = `https://lms.gakusei.kyoto-u.ac.jp/direct/calendar/site/~me.json?merged=true&firstDate=${formatDate(start)}&lastDate=${formatDate(end)}`;

    const calRes = await fetch(calendarUrl, { credentials: "include" });
    const calData = await calRes.json();

    const nowTime = Date.now();
    const deadlines = calData.calendar_collection.filter(e => 
      e.type === "Deadline" && e.firstTime.time > nowTime
    );

    // [3] マッピング（時間も持たせる）
    const deadlineMap = {};
    deadlines.forEach(d => {
      deadlineMap[d.assignmentId] = {
        display: d.firstTime.display,
        time: d.firstTime.time
      };
    });

    // [4] siteIdごとの最も近い締切を取得
    const subjectDeadline = {};
    deadlines.forEach(d => {
      const siteId = d.siteId;
      const deadlineTime = d.firstTime.time;

      // すでに登録されている締切よりも早いものを採用
      if (!subjectDeadline[siteId] || subjectDeadline[siteId] > deadlineTime) {
        subjectDeadline[siteId] = deadlineTime;
      }
    });

    // ★ 講義タブのハイライトを実行
    waitForLectureTabs(subjectDeadline);

    // [5] ログ出力
    assignments.forEach(a => {
      const assignmentId = a.ref?.split('/').pop();
      const deadlineData = deadlineMap[assignmentId];
      if (!deadlineData) return;

      const diff = deadlineData.time - Date.now();
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      console.log(`[${a.siteTitle}] ${a.title} → 締切: ${deadlineData.display}（あと${days}日）`);
    });

    // （...前回の [1]〜[5] の処理はそのまま...）

    // [6] パネル作成
    const panel = document.createElement('div');
    panel.id = "kulms-panel";
    panel.style.position = 'fixed';
    panel.style.right = '0';
    panel.style.top = '0';
    panel.style.width = '350px';
    panel.style.height = '100%';
    panel.style.background = '#ffffff';
    panel.style.borderLeft = '1px solid #ccc';
    panel.style.zIndex = '9999';
    panel.style.overflow = 'auto';
    panel.style.fontSize = '14px';
    panel.style.boxShadow = '-2px 0 5px rgba(0,0,0,0.1)';
    
    // ★ここを追加：初期状態を「画面右外に隠す」、アニメーションをつける
    panel.style.transform = 'translateX(100%)';
    panel.style.transition = 'transform 0.3s ease';

    // タイトル
    const header = document.createElement('div');
    header.innerText = "課題一覧";
    header.style.fontWeight = 'bold';
    header.style.padding = '10px';
    header.style.background = '#f5f5f5';
    panel.appendChild(header);

    // 並び替え（締切順）
    assignments.sort((a, b) => {
      const idA = a.ref?.split('/').pop();
      const idB = b.ref?.split('/').pop();
      return (deadlineMap[idA]?.time || Infinity) - (deadlineMap[idB]?.time || Infinity);
    });

    // パネルへアイテムを追加
    assignments.forEach(a => {
      const assignmentId = a.ref?.split('/').pop();
      const deadlineData = deadlineMap[assignmentId];
      if (!deadlineData) return;

      const diff = deadlineData.time - Date.now();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

      let remaining = days > 0 ? `あと${days}日` : `あと${hours}時間`;

      const item = document.createElement('a');
      item.href = a.url;
      item.target = "_blank";
      item.style.display = 'block';
      item.style.padding = '10px';
      item.style.borderBottom = '1px solid #eee';
      item.style.textDecoration = 'none';
      item.style.color = '#333';
      item.innerText = `[${a.siteTitle}]\n${a.title}\n締切: ${deadlineData.display}\n${remaining}`;

      // 色分け
      if (days <= 1) {
        item.style.background = '#ffcccc';
      } else if (days <= 3) {
        item.style.background = '#fff3cd';
      }

      panel.appendChild(item);
    });

    document.body.appendChild(panel);

    // [7] 表示・非表示を切り替えるボタンの作成
    const toggleBtn = document.createElement('button');
    toggleBtn.innerText = "📝 課題一覧";
    toggleBtn.style.position = 'fixed';
    toggleBtn.style.bottom = '20px';
    toggleBtn.style.right = '20px';
    toggleBtn.style.zIndex = '10000'; // パネルより上に表示
    toggleBtn.style.padding = '12px 20px';
    toggleBtn.style.background = '#0056b3'; // ボタンの色（青系）
    toggleBtn.style.color = '#fff';
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '30px'; // 丸みを持たせる
    toggleBtn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.2)';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.fontWeight = 'bold';
    toggleBtn.style.fontSize = '14px';
    
    // ボタンのホバー（マウスオーバー）時の少し明るくする処理
    toggleBtn.addEventListener('mouseenter', () => toggleBtn.style.background = '#007bff');
    toggleBtn.addEventListener('mouseleave', () => {
      toggleBtn.style.background = panel.style.transform === 'translateX(0px)' ? '#555' : '#0056b3';
    });

    // ボタンをクリックした時の動作
    let isPanelOpen = false;
    toggleBtn.addEventListener('click', () => {
      isPanelOpen = !isPanelOpen;
      if (isPanelOpen) {
        panel.style.transform = 'translateX(0px)'; // パネルを表示
        toggleBtn.innerText = "✖ 閉じる";
        toggleBtn.style.background = '#555'; // 開いている時はグレーに
      } else {
        panel.style.transform = 'translateX(100%)'; // パネルを隠す
        toggleBtn.innerText = "📝 課題一覧";
        toggleBtn.style.background = '#0056b3'; // 元の青色に戻す
      }
    });

    document.body.appendChild(toggleBtn);
    
  } catch (error) {
    console.error("LMS拡張機能エラー:", error);
  }
}

window.addEventListener('load', () => {
  main();
});