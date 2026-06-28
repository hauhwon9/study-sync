const stateRef = { data: null };
let currentUserId = localStorage.getItem("study-sync-user") || null;
let viewUserId = null;
let mode = "guide";
let pendingLoginUserId = null;
let calendarCursor = new Date();
let selectedCalendarDate = dateKey(new Date());
let taskFilter = "all";
const savedLeftNav = localStorage.getItem("study-sync-left-nav");
let leftNavCollapsed = savedLeftNav ? savedLeftNav === "collapsed" : window.matchMedia("(max-width: 860px)").matches;

const guideView = document.querySelector("#guideView");
const appViews = document.querySelectorAll(".app-view");
const dashboard = document.querySelector("#dashboard");
const todayPanel = document.querySelector("#todayPanel");
const calendarPage = document.querySelector("#calendarPage");
const calendarPageTitle = document.querySelector("#calendarPageTitle");
const workspace = document.querySelector("#workspace");
const taskList = document.querySelector("#taskList");
const partnerTaskList = document.querySelector("#partnerTaskList");
const taskNav = document.querySelector("#taskNav");
const leftAppNav = document.querySelector("#leftAppNav");
const leftNavCollapse = document.querySelector("#leftNavCollapse");
const leftNavExpand = document.querySelector("#leftNavExpand");
const leftNavMascot = document.querySelector("#leftNavMascot");
const leftNavName = document.querySelector("#leftNavName");
const messageFeed = document.querySelector("#messageFeed");
const timelineFeed = document.querySelector("#timelineFeed");
const ddlCalendar = document.querySelector("#ddlCalendar");
const syncStatus = document.querySelector("#syncStatus");
const planTitle = document.querySelector("#planTitle");
const partnerTitle = document.querySelector("#partnerTitle");
const messageForm = document.querySelector("#messageForm");
const profileMessageForm = document.querySelector("#profileMessageForm");
const taskDialog = document.querySelector("#taskDialog");
const taskForm = document.querySelector("#taskForm");
const taskTemplateSelect = document.querySelector("#taskTemplateSelect");
const detailDialog = document.querySelector("#detailDialog");
const detailBody = document.querySelector("#detailBody");
const detailTitle = document.querySelector("#detailTitle");
const detailMeta = document.querySelector("#detailMeta");
const dialogTitle = document.querySelector("#dialogTitle");
const openTaskDialog = document.querySelector("#openTaskDialog");
const calendarAddTask = document.querySelector("#calendarAddTask");
const activeMascot = document.querySelector("#activeMascot");
const profileJump = document.querySelector("#profileJump");
const profilePanel = document.querySelector("#profilePanel");
const profileMascot = document.querySelector("#profileMascot");
const profileTitle = document.querySelector("#profileTitle");
const profileSummary = document.querySelector("#profileSummary");
const profileCharts = document.querySelector("#profileCharts");
const profileFeed = document.querySelector("#profileFeed");
const pageTitle = document.querySelector("#pageTitle");
const closeTaskDialog = document.querySelector("#closeTaskDialog");
const cancelTaskDialog = document.querySelector("#cancelTaskDialog");
const closeDetailDialog = document.querySelector("#closeDetailDialog");
const loginDialog = document.querySelector("#loginDialog");
const loginForm = document.querySelector("#loginForm");
const loginTitle = document.querySelector("#loginTitle");
const loginHint = document.querySelector("#loginHint");
const loginError = document.querySelector("#loginError");
const cancelLoginDialog = document.querySelector("#cancelLoginDialog");
const skipLoginButton = document.querySelector("#skipLoginButton");
const toast = document.querySelector("#toast");
const hoverCard = document.querySelector("#hoverCard");

const formatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

const monthFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long"
});

const taskTemplates = {
  blank: {
    title: "",
    subject: "",
    totalSteps: 5,
    steps: [],
    notes: ""
  },
  vocab: {
    title: "背单词打卡",
    subject: "英语",
    steps: ["确定今日词表", "背诵新词", "复习旧词", "默写检测", "整理易错词"],
    notes: "可以把词表范围、APP 名称或错词整理方式写在这里。"
  },
  paper: {
    title: "论文阅读",
    subject: "阅读",
    steps: ["扫读摘要和结论", "标记研究问题", "精读方法部分", "整理关键图表", "写 150 字复盘"],
    notes: "适合读论文、文献或长篇资料，读完可以给对方讲一遍重点。"
  },
  exam: {
    title: "考试复习",
    subject: "复习",
    steps: ["梳理考点清单", "复习公式和定义", "完成基础题", "整理错题", "二刷错题", "做一套限时练习"],
    notes: "把章节范围、题目来源和薄弱点写清楚。"
  }
};

async function postAction(type, payload = {}) {
  const authUserId = currentUserId;
  const response = await fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      payload,
      auth: {
        userId: authUserId,
        token: localStorage.getItem(`study-sync-token-${authUserId}`) || ""
      }
    })
  });
  if (!response.ok) throw new Error("操作失败");
  stateRef.data = await response.json();
  render();
  showToast(feedbackFor(type));
}

async function loadState() {
  const response = await fetch("/api/state");
  stateRef.data = await response.json();
  if (currentUserId && !stateRef.data.users.some(user => user.id === currentUserId)) {
    currentUserId = null;
  }
  applyRouteFromHash(false);
  render();
}

function connectEvents() {
  const events = new EventSource("/events");
  events.addEventListener("open", () => {
    syncStatus.textContent = "实时同步已连接";
  });
  events.addEventListener("error", () => {
    syncStatus.textContent = "同步重连中";
  });
  events.addEventListener("state", event => {
    stateRef.data = JSON.parse(event.data);
    render();
  });
}

function userById(id) {
  return stateRef.data.users.find(user => user.id === id) || stateRef.data.users[0];
}

function otherUser(id = currentUserId) {
  return stateRef.data.users.find(user => user.id !== id) || stateRef.data.users[0];
}

function tasksFor(userId) {
  return stateRef.data.tasks.filter(task => task.ownerId === userId);
}

function taskValue(task) {
  if (Array.isArray(task.steps)) return task.steps.filter(step => step.done).length;
  return Number(task.progress?.[task.ownerId] || 0);
}

function taskCompletion(task) {
  return Math.round((taskValue(task) / Math.max(1, task.totalSteps)) * 100);
}

function taskStatus(task) {
  if (task.status === "archived") return "archived";
  const percent = taskCompletion(task);
  if (percent === 100) return "completed";
  if (task.dueDate && task.dueDate < dateKey(new Date())) return "unfinished";
  return "inProgress";
}

function allProgressFor(userId) {
  const tasks = tasksFor(userId);
  const total = tasks.reduce((sum, task) => sum + task.totalSteps, 0);
  const done = tasks.reduce((sum, task) => sum + taskValue(task), 0);
  return total ? Math.round((done / total) * 100) : 0;
}

function remainingFor(userId) {
  return tasksFor(userId).reduce((sum, task) => {
    return sum + Math.max(0, task.totalSteps - taskValue(task));
  }, 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(value) {
  return formatter.format(new Date(value));
}

function mascotFor(userId) {
  return userId === "xiaojimao" ? "/assets/xiaojimao.png" : "/assets/xiaobai.png";
}

function iconForTimeline(type) {
  if (type.startsWith("message:")) return "✎";
  if (type === "task:complete") return "✓";
  if (type === "task:create") return "＋";
  if (type === "task:delete") return "×";
  if (type === "task:archive") return "⌄";
  if (type === "task:restore") return "↺";
  if (type.startsWith("step:")) return "☑";
  if (type === "progress:set") return "↗";
  return "•";
}

function feedbackFor(type) {
  const labels = {
    "task:create": "任务已加入学习窝",
    "task:update": "任务已更新",
    "task:delete": "任务已删除",
    "task:archive": "任务已归档",
    "task:restore": "任务已恢复",
    "task:complete": "任务完成啦",
    "progress:set": "进度已同步",
    "step:toggle": "步骤已更新",
    "step:reorder": "步骤顺序已保存",
    "message:create": "小纸条已送达"
  };
  return labels[type] || "已同步";
}

let toastTimer = null;
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.remove("show");
  window.requestAnimationFrame(() => toast.classList.add("show"));
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => {
      toast.hidden = true;
    }, 180);
  }, 1700);
}

function moveHoverCard(event) {
  if (!hoverCard || hoverCard.hidden) return;
  const margin = 16;
  const rect = hoverCard.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - margin, event.clientX + 18);
  const top = Math.min(window.innerHeight - rect.height - margin, event.clientY + 18);
  hoverCard.style.left = `${Math.max(margin, left)}px`;
  hoverCard.style.top = `${Math.max(margin, top)}px`;
}

function showHoverCard(target, event) {
  if (!hoverCard || !target) return;
  hoverCard.innerHTML = `
    <div class="hover-card-head">
      <span style="--owner:${target.dataset.hoverColor || "var(--accent)"}"></span>
      <strong>${escapeHtml(target.dataset.hoverTitle || "任务详情")}</strong>
    </div>
    <p>${escapeHtml(target.dataset.hoverMeta || "")}</p>
    <small>${escapeHtml(target.dataset.hoverDue || "")}</small>
    <em>${escapeHtml(target.dataset.hoverNotes || "")}</em>
  `;
  hoverCard.hidden = false;
  hoverCard.classList.add("show");
  moveHoverCard(event);
}

function hideHoverCard() {
  if (!hoverCard) return;
  hoverCard.classList.remove("show");
  hoverCard.hidden = true;
}

function tokenFor(userId) {
  return localStorage.getItem(`study-sync-token-${userId}`) || "";
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function loginUser(userId, password = "") {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, password })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "进入失败");
  localStorage.setItem(`study-sync-token-${userId}`, body.token);
  enterUser(userId);
  loginDialog.close();
}

function requestLogin(userId) {
  pendingLoginUserId = userId;
  const user = userById(userId);
  loginForm.reset();
  loginTitle.textContent = `进入${user.name}的小窝`;
  loginHint.textContent = "如果服务器没有设置口令，可以直接进入。";
  loginError.textContent = "";
  loginDialog.showModal();
}

function enterUser(userId) {
  currentUserId = userId;
  viewUserId = userId;
  mode = "own";
  localStorage.setItem("study-sync-user", userId);
  setRoute("own");
  render();
}

function showGuide() {
  mode = "guide";
  viewUserId = null;
  setRoute("guide");
  render();
}

function showOwn() {
  if (!currentUserId) {
    showGuide();
    return;
  }
  mode = "own";
  viewUserId = currentUserId;
  setRoute("own");
  render();
}

function showProfile(userId) {
  if (!currentUserId) {
    showGuide();
    return;
  }
  mode = userId === currentUserId ? "own" : "profile";
  viewUserId = userId;
  setRoute(userId === currentUserId ? "own" : "partner");
  render();
}

function showCalendar() {
  if (!currentUserId) {
    showGuide();
    return;
  }
  mode = "calendar";
  viewUserId = currentUserId;
  setRoute("calendar");
  render();
}

function setRoute(route) {
  const nextHash = `#${route}`;
  if (window.location.hash !== nextHash) {
    window.history.pushState(null, "", nextHash);
  }
}

function applyRouteFromHash(shouldRender = true) {
  if (!stateRef.data) return;
  const route = window.location.hash.replace("#", "") || "own";
  if (!currentUserId) {
    mode = "guide";
    viewUserId = null;
  } else if (route === "calendar") {
    mode = "calendar";
    viewUserId = currentUserId;
  } else if (route === "partner") {
    mode = "profile";
    viewUserId = otherUser(currentUserId).id;
  } else if (route === "guide") {
    mode = "guide";
    viewUserId = null;
  } else {
    mode = "own";
    viewUserId = currentUserId;
  }
  if (shouldRender) render();
}

function renderShell() {
  const inGuide = mode === "guide" || !currentUserId || !viewUserId;
  guideView.hidden = !inGuide;
  appViews.forEach(view => {
    view.hidden = inGuide;
  });
  if (!inGuide) {
    dashboard.hidden = mode === "calendar";
    todayPanel.hidden = mode === "calendar";
    workspace.hidden = mode === "calendar";
    calendarPage.hidden = mode !== "calendar";
  }

  const themeUserId = viewUserId || currentUserId || "xiaobai";
  document.body.dataset.theme = themeUserId;
  document.body.dataset.view = inGuide ? "guide" : mode;
  document.body.dataset.navCollapsed = leftNavCollapsed ? "true" : "false";
}

function renderNavigation() {
  if (mode === "guide") return;

  const viewed = userById(viewUserId);
  const target = mode === "profile" ? userById(currentUserId) : otherUser(currentUserId);

  pageTitle.textContent = mode === "calendar" ? `${viewed.name}的爪爪 DDL` : mode === "profile" ? `${viewed.name}主页` : `${viewed.name}的学习小窝`;
  activeMascot.src = mascotFor(target.id);

  document.querySelectorAll("[data-nav]").forEach(button => {
    button.classList.toggle("active", button.dataset.nav === "own" && mode !== "guide");
  });
}

function renderLeftNav() {
  if (mode === "guide" || !currentUserId || !viewUserId) return;
  const viewed = userById(viewUserId);
  leftNavMascot.src = mascotFor(currentUserId);
  leftNavName.textContent = `${userById(currentUserId).name}的小窝`;
  leftAppNav.classList.toggle("collapsed", leftNavCollapsed);
  leftNavExpand.hidden = !leftNavCollapsed;
  leftNavCollapse.textContent = leftNavCollapsed ? "›" : "‹";
  leftNavCollapse.title = leftNavCollapsed ? "展开导航" : "收起导航";

  document.querySelectorAll("[data-left-nav]").forEach(button => {
    const key = button.dataset.leftNav;
    const active =
      (key === "own" && mode === "own") ||
      (key === "partner" && mode === "profile" && viewed.id !== currentUserId) ||
      (key === "calendar" && mode === "calendar");
    button.classList.toggle("active", active);
  });
}

function renderDashboard() {
  const viewed = userById(viewUserId);
  const tasks = tasksFor(viewed.id);
  const unfinishedDdl = tasks.filter(task => task.dueDate && taskCompletion(task) < 100).length;
  const finishedTasks = tasks.filter(task => taskCompletion(task) === 100).length;

  dashboard.innerHTML = `
    <article class="metric">
      <span>${escapeHtml(viewed.name)}总进度</span>
      <strong>${allProgressFor(viewed.id)}%</strong>
    </article>
    <article class="metric">
      <span>剩余步骤</span>
      <strong>${remainingFor(viewed.id)}</strong>
    </article>
    <article class="metric">
      <span>待截止任务</span>
      <strong>${unfinishedDdl}</strong>
    </article>
    <article class="metric">
      <span>已完成任务</span>
      <strong>${finishedTasks}</strong>
    </article>
  `;
}

function daysUntil(dueDate) {
  if (!dueDate) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  return Math.round((due - today) / 86400000);
}

function renderTodayPanel() {
  const viewed = userById(viewUserId);
  const tasks = tasksFor(viewed.id);
  const todayTasks = tasks.filter(task => daysUntil(task.dueDate) === 0 && taskCompletion(task) < 100);
  const completedSteps = tasks.reduce((sum, task) => sum + taskValue(task), 0);
  const totalSteps = tasks.reduce((sum, task) => sum + task.totalSteps, 0);
  const weekPercent = totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0;

  todayPanel.innerHTML = `
    <article class="today-card">
      <span>今天要盯住</span>
      <strong>${todayTasks.length ? todayTasks.map(task => escapeHtml(task.title)).join(" · ") : "今天没有卡点"}</strong>
    </article>
    <article class="today-card stat-card">
      <span>本周推进</span>
      <div class="mini-bars">
        <div class="bar"><span style="width:${weekPercent}%;background-color:${viewed.color}"></span></div>
        <strong>${completedSteps}/${totalSteps}</strong>
      </div>
    </article>
  `;
}

function renderMessages() {
  const recent = stateRef.data.messages
    .filter(item => (item.channel || "public") === "public" && !item.taskId && !item.profileUserId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 14);

  messageFeed.innerHTML = recent
    .map(item => {
      const user = userById(item.userId);
      return `
        <article class="feed-item" style="--owner:${user.color}">
          <span class="feed-avatar" style="--owner:${user.color}">${escapeHtml(user.name.slice(0, 1))}</span>
          <div>
            <span class="time">${escapeHtml(user.name)} · ${formatTime(item.createdAt)}</span>
            <p>${escapeHtml(item.body)}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function timelineLabel(item) {
  const task = item.taskId ? findTask(item.taskId) : null;
  const taskTitle = task?.title || item.meta?.taskTitle || item.meta?.title;
  const labels = {
    "task:create": "新建了任务",
    "task:update": "更新了任务",
    "task:delete": "删除了任务",
    "task:archive": "归档了任务",
    "task:restore": "恢复了任务",
    "task:complete": "完成了任务",
    "progress:set": "更新了进度",
    "step:done": "勾选了步骤",
    "step:undone": "取消了步骤",
    "step:reorder": "调整了步骤顺序",
    "message:public": "写了公开留言",
    "message:profile": "写了主页留言",
    "message:task": "写了任务留言"
  };
  return {
    action: labels[item.type] || "记录了一条动态",
    taskTitle
  };
}

function renderTimeline() {
  const items = (stateRef.data.timeline || [])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 18);

  timelineFeed.innerHTML = items.length
    ? items
        .map(item => {
          const user = userById(item.userId);
          const label = timelineLabel(item);
          return `
            <article class="timeline-item">
              <span class="timeline-dot" style="--dot:${user.color}">${escapeHtml(iconForTimeline(item.type))}</span>
              <div>
                <span class="time">${escapeHtml(user.name)} · ${formatTime(item.createdAt)}</span>
                <p><strong>${escapeHtml(label.action)}</strong>${label.taskTitle ? ` · ${escapeHtml(label.taskTitle)}` : ""}</p>
                ${item.body ? `<small>${escapeHtml(item.body)}</small>` : ""}
              </div>
            </article>
          `;
        })
        .join("")
    : `<article class="timeline-item empty"><span class="timeline-dot"></span><div><p>还没有学习动态。</p></div></article>`;
}

function renderProfileMessages(profileUserId) {
  const recent = stateRef.data.messages
    .filter(item => item.channel === "profile" && item.profileUserId === profileUserId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  profileFeed.innerHTML = recent.length
    ? recent
        .map(item => {
          const user = userById(item.userId);
          return `
            <article class="feed-item" style="--owner:${user.color}">
              <span class="feed-avatar" style="--owner:${user.color}">${escapeHtml(user.name.slice(0, 1))}</span>
              <div>
                <span class="time">${escapeHtml(user.name)} · ${formatTime(item.createdAt)}</span>
                <p>${escapeHtml(item.body)}</p>
              </div>
            </article>
          `;
        })
        .join("")
    : `<article class="feed-item empty"><p>这里还没有主页留言。</p></article>`;
}

function renderCalendar() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const viewed = userById(viewUserId);
  calendarPageTitle.textContent = `${viewed.name}的爪爪 DDL`;
  const first = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const tasks = stateRef.data.tasks
    .filter(task => task.dueDate)
    .sort((a, b) => {
      const byDate = String(a.dueDate).localeCompare(String(b.dueDate));
      if (byDate) return byDate;
      return userById(a.ownerId).name.localeCompare(userById(b.ownerId).name, "zh-CN");
    });
  const todayKey = dateKey(today);
  if (!selectedCalendarDate) selectedCalendarDate = todayKey;
  const selectedDate = new Date(`${selectedCalendarDate}T00:00:00`);
  if (selectedDate.getMonth() !== calendarCursor.getMonth() || selectedDate.getFullYear() !== calendarCursor.getFullYear()) {
    selectedCalendarDate = dateKey(first);
  }
  const selectedTasks = tasks.filter(task => task.dueDate === selectedCalendarDate);

  ddlCalendar.innerHTML = `
    <div class="month-calendar">
      <div class="month-header">
        <button class="month-nav" data-month-nav="prev" type="button" title="上个月">‹</button>
        <strong>${escapeHtml(monthFormatter.format(first))}</strong>
        <button class="month-nav" data-month-nav="next" type="button" title="下个月">›</button>
        <button class="month-today" data-month-nav="today" type="button">今天</button>
      </div>
      <div class="owner-legend">
        ${stateRef.data.users
          .map(user => `<span style="--owner:${user.color}"><i></i>${escapeHtml(user.name)}的 DDL</span>`)
          .join("")}
      </div>
      <div class="weekday-row">
        ${["日", "一", "二", "三", "四", "五", "六"].map(day => `<span>${day}</span>`).join("")}
      </div>
      <div class="month-grid">
        ${cells
          .map(date => {
            const key = dateKey(date);
            const items = tasks.filter(task => task.dueDate === key);
            const outside = date.getMonth() !== first.getMonth();
            return `
              <button class="month-cell ${outside ? "outside" : ""} ${items.length ? "has-ddl" : ""} ${key === todayKey ? "today" : ""} ${key === selectedCalendarDate ? "selected" : ""}" data-calendar-date="${key}" type="button">
                <div class="month-date">
                  <strong>${date.getDate()}</strong>
                  ${items.length ? `<span>${items.length}</span>` : ""}
                </div>
                <div class="month-cell-tasks">
                  ${items
                    .slice(0, 3)
                    .map(task => {
                      const owner = userById(task.ownerId);
                      return `
                        <span class="month-cell-task" ${taskHoverAttrs(task)} style="--owner:${owner.color};--done:${taskCompletion(task)}%">
                          <em>${escapeHtml(owner.name)}</em>
                          <strong>${escapeHtml(task.title)}</strong>
                        </span>
                      `;
                    })
                    .join("")}
                  ${items.length > 3 ? `<b class="more-ddl">+${items.length - 3}</b>` : ""}
                </div>
              </button>
            `;
          })
          .join("")}
      </div>
      <section class="month-agenda">
        <div class="month-agenda-head">
          <strong>${escapeHtml(
            new Date(`${selectedCalendarDate}T00:00:00`).toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "short"
            })
          )}</strong>
          <span>${selectedTasks.length ? `${selectedTasks.length} 个 DDL` : "没有 DDL"}</span>
        </div>
        <div class="month-agenda-list">
          ${
            selectedTasks.length
              ? selectedTasks
                  .map(
                    task => {
                      const owner = userById(task.ownerId);
                      return `
                      <button class="month-task" data-task-id="${task.id}" ${taskHoverAttrs(task)} type="button" style="--owner:${owner.color};--done:${taskCompletion(task)}%">
                        <span></span>
                        <strong>${escapeHtml(owner.name)} · ${escapeHtml(task.title)}</strong>
                        <small>${taskCompletion(task)}% · ${taskValue(task)}/${task.totalSteps} 步 · ${escapeHtml(dueLabel(task))}</small>
                      </button>
                    `;
                    }
                  )
                  .join("")
              : `<p class="empty-agenda">这天没有 DDL，可以安心推进手头任务。</p>`
          }
        </div>
      </section>
    </div>
  `;
}

function dueLabel(task) {
  if (!task.dueDate) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${task.dueDate}T00:00:00`);
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天截止";
  return `还剩 ${days} 天`;
}

function taskHoverAttrs(task) {
  const owner = userById(task.ownerId);
  const meta = `${owner.name} · ${task.subject || "学习"} · ${taskCompletion(task)}% · ${taskValue(task)}/${task.totalSteps} 步`;
  return [
    `data-hover-card="task"`,
    `data-hover-owner="${escapeHtml(owner.name)}"`,
    `data-hover-color="${escapeHtml(owner.color)}"`,
    `data-hover-title="${escapeHtml(task.title)}"`,
    `data-hover-meta="${escapeHtml(meta)}"`,
    `data-hover-due="${escapeHtml(task.dueDate ? dueLabel(task) : "无截止日期")}"`,
    `data-hover-notes="${escapeHtml(task.notes || "点开可以查看步骤和留言。")}"`
  ].join(" ");
}

function renderProfilePanel() {
  const viewed = userById(viewUserId);
  const tasks = tasksFor(viewed.id);
  const completion = allProgressFor(viewed.id);
  profilePanel.hidden = mode !== "profile";
  if (mode !== "profile") return;

  profileMascot.src = mascotFor(viewed.id);
  profileTitle.textContent = `${viewed.name}主页`;
  profileSummary.textContent = `${tasks.length} 个任务 · ${remainingFor(viewed.id)} 个步骤待完成`;

  profileCharts.innerHTML = `
    <div class="chart-card">
      <div class="donut" style="--value:${completion}">
        <span>${completion}%</span>
      </div>
      <p>总进度</p>
    </div>
    <div class="chart-card">
      <strong>${tasks.filter(task => taskCompletion(task) === 100).length}</strong>
      <p>完成任务</p>
    </div>
    <div class="chart-card">
      <strong>${tasks.filter(task => task.dueDate && taskCompletion(task) < 100).length}</strong>
      <p>待截止任务</p>
    </div>
  `;
  renderProfileMessages(viewed.id);
}

function renderTaskNav(tasks, readonly) {
  const items = [
    { key: "all", label: "全部任务", count: tasks.length },
    { key: "inProgress", label: "进行中", count: tasks.filter(task => taskStatus(task) === "inProgress").length },
    { key: "unfinished", label: "未完成", count: tasks.filter(task => taskStatus(task) === "unfinished").length },
    { key: "completed", label: "已完成", count: tasks.filter(task => taskStatus(task) === "completed").length },
    { key: "archived", label: "已归档", count: tasks.filter(task => taskStatus(task) === "archived").length }
  ];

  taskNav.innerHTML = `
    <div class="task-nav-inner">
      ${items
        .map(
          item => `
            <button class="task-filter ${taskFilter === item.key ? "active" : ""}" data-task-filter="${item.key}" type="button">
              <span>${escapeHtml(item.label)}</span>
              <strong>${item.count}</strong>
            </button>
          `
        )
        .join("")}
    </div>
    ${readonly ? `<p>${escapeHtml(userById(viewUserId).name)}的任务概览</p>` : `<p>完成后可以归档，当前任务会更清爽。</p>`}
  `;
}

function renderTaskCard(task, readonly) {
  const owner = userById(task.ownerId);
  const value = taskValue(task);
  const percent = taskCompletion(task);
  const status = taskStatus(task);
  const taskMessages = stateRef.data.messages
    .filter(message => message.channel === "task" && message.taskId === task.id)
    .slice(0, 2);

  return `
    <article class="task-card ${readonly ? "readonly" : ""} ${status}" data-task-id="${task.id}" ${taskHoverAttrs(task)} style="--owner:${owner.color}">
      <button class="task-open" data-task-id="${task.id}" type="button" aria-label="查看任务详情"></button>
      ${status === "unfinished" ? `<span class="angry-badge" aria-hidden="true">快开始!</span>` : ""}
      <div class="task-title">
        <div>
          <strong>${escapeHtml(task.title)}</strong>
          <p>${escapeHtml(task.notes || "点开查看任务详情和步骤")}</p>
        </div>
        ${readonly ? "" : `<button class="icon-btn edit-task" type="button" title="编辑任务"><span aria-hidden="true">✎</span></button>`}
      </div>
      <div class="task-meta">
        <span class="chip">${escapeHtml(owner.name)}</span>
        <span class="chip">${escapeHtml(task.subject || "学习")}</span>
        ${status === "inProgress" ? `<span class="chip progress-chip">进行中</span>` : ""}
        ${status === "unfinished" ? `<span class="chip angry">未完成</span>` : ""}
        ${status === "completed" ? `<span class="chip done">已完成</span>` : ""}
        ${status === "archived" ? `<span class="chip muted-chip">已归档</span>` : ""}
        ${task.dueDate ? `<span class="chip warning">${escapeHtml(dueLabel(task))}</span>` : ""}
        <span class="chip">${value}/${task.totalSteps} 步</span>
      </div>
      <div class="progress-stack">
        <div class="progress-row">
          <div class="avatar" style="background:${owner.color}">${escapeHtml(owner.name.slice(0, 1))}</div>
          <div class="bar-wrap">
            <div class="bar-label">
              <span>完成度</span>
              <span>${percent}%</span>
            </div>
            <div class="bar"><span style="width:${percent}%;background-color:${owner.color}"></span></div>
          </div>
          ${
            readonly
              ? ""
              : `<div class="stepper" aria-label="${escapeHtml(owner.name)}进度">
                  <button class="progress-minus" type="button">−</button>
                  <output>${value}</output>
                  <button class="progress-plus" type="button">+</button>
                </div>`
          }
        </div>
      </div>
      ${
        taskMessages.length
          ? `<div class="feed">${taskMessages
              .map(message => {
                const user = userById(message.userId);
                return `<div class="feed-item" style="--owner:${user.color}"><span class="feed-avatar" style="--owner:${user.color}">${escapeHtml(user.name.slice(0, 1))}</span><div><span class="time">${escapeHtml(user.name)} · ${formatTime(message.createdAt)}</span><p>${escapeHtml(message.body)}</p></div></div>`;
              })
              .join("")}</div>`
          : ""
      }
      <form class="task-message">
        <input name="body" maxlength="500" placeholder="针对这个任务留言" />
        <button class="ghost-btn" type="submit"><span aria-hidden="true">↗</span>发送</button>
      </form>
      ${
        readonly
          ? ""
          : `<div class="task-actions">
              ${
                status === "archived"
                  ? `<button class="ghost-btn restore-task" type="button"><span aria-hidden="true">↺</span>恢复</button>`
                  : `<button class="ghost-btn archive-task" type="button"><span aria-hidden="true">⌄</span>归档</button>`
              }
              ${status === "completed" || status === "archived" ? "" : `<button class="ghost-btn complete-mine" type="button"><span aria-hidden="true">✓</span>全部完成</button>`}
              <button class="ghost-btn delete-task" type="button"><span aria-hidden="true">×</span>删除</button>
            </div>`
      }
    </article>
  `;
}

function renderTasks() {
  const viewed = userById(viewUserId);
  const readonly = viewUserId !== currentUserId;
  const tasks = tasksFor(viewed.id);
  const visibleTasks = taskFilter === "all" ? tasks : tasks.filter(task => taskStatus(task) === taskFilter);
  const emptyTaskLabels = {
    all: "",
    inProgress: "进行中的",
    unfinished: "未完成的",
    completed: "已完成的",
    archived: "已归档的"
  };

  planTitle.textContent = readonly ? `${viewed.name}的计划` : `${viewed.name}的今日小窝`;
  partnerTitle.textContent = readonly ? "主页留言" : "任务留言";
  openTaskDialog.hidden = readonly;
  partnerTaskList.hidden = true;
  renderTaskNav(tasks, readonly);

  taskList.innerHTML = visibleTasks.length
    ? visibleTasks.map(task => renderTaskCard(task, readonly)).join("")
    : `<article class="task-card empty-task"><p class="task-notes">${escapeHtml(viewed.name)}这里暂时没有${emptyTaskLabels[taskFilter] || ""}任务。</p></article>`;
}

function render() {
  if (!stateRef.data) return;
  renderShell();
  if (mode === "guide" || !currentUserId || !viewUserId) return;
  renderNavigation();
  renderLeftNav();
  renderDashboard();
  renderTodayPanel();
  renderCalendar();
  renderMessages();
  renderTimeline();
  renderProfilePanel();
  renderTasks();
}

function openDialog(task = null) {
  taskForm.reset();
  dialogTitle.textContent = task ? "编辑任务" : "新增任务";
  taskForm.taskId.value = task?.id || "";
  taskForm.ownerId.value = task?.ownerId || currentUserId;
  taskForm.title.value = task?.title || "";
  taskForm.subject.value = task?.subject || "";
  taskForm.dueDate.value = task?.dueDate || "";
  taskForm.totalSteps.value = task?.totalSteps || 3;
  taskForm.stepsText.value = task?.steps?.map(step => step.title).join("\n") || "";
  taskForm.notes.value = task?.notes || "";
  if (taskTemplateSelect) taskTemplateSelect.value = "blank";
  taskDialog.showModal();
}

function openTaskDetail(task) {
  const owner = userById(task.ownerId);
  const readonly = task.ownerId !== currentUserId;
  const value = taskValue(task);
  const percent = taskCompletion(task);
  const messages = stateRef.data.messages.filter(message => message.channel === "task" && message.taskId === task.id).slice(0, 8);

  detailTitle.textContent = task.title;
  detailMeta.textContent = `${owner.name} · ${task.subject || "学习"} · ${task.dueDate || "无截止日期"} · ${value}/${task.totalSteps} 步`;
  detailBody.innerHTML = `
    <div class="detail-progress">
      <div class="bar"><span style="width:${percent}%;background-color:${owner.color}"></span></div>
      <strong>${percent}%</strong>
    </div>
    <p class="task-notes">${escapeHtml(task.notes || "还没有备注。")}</p>
    <div class="step-list" data-task-id="${task.id}">
      ${(task.steps || [])
        .map(
          (step, index) => `
            <div class="step-item" draggable="${readonly ? "false" : "true"}" data-step-id="${step.id}">
              ${readonly ? "" : `<button class="drag-handle" type="button" title="拖拽排序">⋮⋮</button>`}
              <input type="checkbox" data-step-id="${step.id}" ${step.done ? "checked" : ""} ${readonly ? "disabled" : ""} />
              <span>${escapeHtml(step.title)}</span>
              ${
                readonly
                  ? ""
                  : `<div class="step-move">
                      <button type="button" data-step-move="up" ${index === 0 ? "disabled" : ""}>↑</button>
                      <button type="button" data-step-move="down" ${index === task.steps.length - 1 ? "disabled" : ""}>↓</button>
                    </div>`
              }
            </div>
          `
        )
        .join("")}
    </div>
    <div class="detail-actions">
      ${readonly ? "" : `<button class="ghost-btn detail-edit" type="button"><span aria-hidden="true">✎</span>编辑任务</button>`}
    </div>
    <h3 class="detail-section-title">任务留言</h3>
    <div class="feed detail-feed">
      ${messages
        .map(message => {
          const user = userById(message.userId);
          return `<div class="feed-item" style="--owner:${user.color}"><span class="feed-avatar" style="--owner:${user.color}">${escapeHtml(user.name.slice(0, 1))}</span><div><span class="time">${escapeHtml(user.name)} · ${formatTime(message.createdAt)}</span><p>${escapeHtml(message.body)}</p></div></div>`;
        })
        .join("")}
    </div>
  `;
  detailDialog.dataset.taskId = task.id;
  detailDialog.showModal();
}

function findTask(taskId) {
  return stateRef.data.tasks.find(task => task.id === taskId);
}

function stepIdsFromDetail() {
  return Array.from(detailBody.querySelectorAll(".step-item")).map(item => item.dataset.stepId);
}

function moveStep(stepId, direction) {
  const ids = stepIdsFromDetail();
  const index = ids.indexOf(stepId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
  const list = detailBody.querySelector(".step-list");
  const step = detailBody.querySelector(`.step-item[data-step-id="${stepId}"]`);
  const target = detailBody.querySelector(`.step-item[data-step-id="${ids[nextIndex]}"]`);
  if (list && step && target) {
    list.insertBefore(step, direction === "up" ? target : target.nextSibling);
  }
  const [item] = ids.splice(index, 1);
  ids.splice(nextIndex, 0, item);
  postAction("step:reorder", {
    taskId: detailDialog.dataset.taskId,
    stepIds: ids
  });
}

function triggerPawBurst(anchor = document.body) {
  const burst = document.createElement("div");
  burst.className = "paw-burst";
  const rect = anchor.getBoundingClientRect?.() || { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top + rect.height / 2}px`;
  burst.innerHTML = Array.from({ length: 6 }, (_, index) => `<span style="--i:${index}"></span>`).join("");
  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), 820);
}

function applyTaskTemplate(templateKey) {
  const template = taskTemplates[templateKey] || taskTemplates.blank;
  if (taskForm.taskId.value || templateKey === "blank") return;
  taskForm.title.value = template.title;
  taskForm.subject.value = template.subject;
  taskForm.totalSteps.value = template.steps.length || template.totalSteps || 5;
  taskForm.stepsText.value = template.steps.join("\n");
  taskForm.notes.value = template.notes;
}

document.addEventListener("click", event => {
  const enterButton = event.target.closest("[data-enter-user]");
  if (enterButton) {
    const userId = enterButton.dataset.enterUser;
    if (tokenFor(userId)) enterUser(userId);
    else requestLogin(userId);
    return;
  }

  const miniDdl = event.target.closest(".mini-ddl");
  if (miniDdl) {
    const task = findTask(miniDdl.dataset.taskId);
    if (task) openTaskDetail(task);
    return;
  }

  const navButton = event.target.closest("[data-nav]");
  if (navButton) {
    if (navButton.dataset.nav === "guide") showGuide();
    if (navButton.dataset.nav === "own") showOwn();
    return;
  }

  if (event.target.closest("#leftNavCollapse") || event.target.closest("#leftNavExpand")) {
    leftNavCollapsed = event.target.closest("#leftNavCollapse") ? true : false;
    localStorage.setItem("study-sync-left-nav", leftNavCollapsed ? "collapsed" : "expanded");
    renderShell();
    renderLeftNav();
    return;
  }

  const leftNavButton = event.target.closest("[data-left-nav]");
  if (leftNavButton) {
    const target = leftNavButton.dataset.leftNav;
    if (target === "own") showOwn();
    if (target === "partner") showProfile(otherUser(currentUserId).id);
    if (target === "calendar") showCalendar();
    if (target === "messages") {
      if (mode === "calendar") showOwn();
      window.setTimeout(() => timelineFeed?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    }
    return;
  }

  const taskFilterButton = event.target.closest("[data-task-filter]");
  if (taskFilterButton) {
    taskFilter = taskFilterButton.dataset.taskFilter;
    renderTasks();
    return;
  }

  if (event.target.closest("#profileJump")) {
    if (mode === "profile") showOwn();
    else showProfile(otherUser(currentUserId).id);
    return;
  }

  if (event.target.closest("#calendarAddTask")) {
    openDialog();
    return;
  }

  const monthNav = event.target.closest("[data-month-nav]");
  if (monthNav) {
    if (monthNav.dataset.monthNav === "today") {
      calendarCursor = new Date();
      selectedCalendarDate = dateKey(new Date());
    } else {
      const next = new Date(calendarCursor);
      next.setMonth(next.getMonth() + (monthNav.dataset.monthNav === "next" ? 1 : -1));
      calendarCursor = next;
      selectedCalendarDate = dateKey(new Date(next.getFullYear(), next.getMonth(), 1));
    }
    renderCalendar();
    return;
  }

  const calendarDay = event.target.closest("[data-calendar-date]");
  if (calendarDay) {
    selectedCalendarDate = calendarDay.dataset.calendarDate;
    const next = new Date(`${selectedCalendarDate}T00:00:00`);
    calendarCursor = new Date(next.getFullYear(), next.getMonth(), 1);
    renderCalendar();
    return;
  }

  const ddlButton = event.target.closest(".ddl-pill, .month-task");
  if (ddlButton) {
    const task = findTask(ddlButton.dataset.taskId);
    if (task) openTaskDetail(task);
    return;
  }

  const card = event.target.closest(".task-card");
  if (!card || !stateRef.data) return;
  const task = findTask(card.dataset.taskId);
  if (!task) return;

  if (event.target.closest(".task-message") || event.target.closest("input")) return;

  if (event.target.closest(".progress-plus") || event.target.closest(".progress-minus")) {
    const delta = event.target.closest(".progress-plus") ? 1 : -1;
    postAction("progress:set", {
      taskId: task.id,
      userId: currentUserId,
      value: taskValue(task) + delta
    });
    return;
  }

  if (event.target.closest(".complete-mine")) {
    postAction("progress:set", {
      taskId: task.id,
      userId: currentUserId,
      value: task.totalSteps
    });
    triggerPawBurst(card);
    activeMascot.classList.add("mascot-hop");
    window.setTimeout(() => activeMascot.classList.remove("mascot-hop"), 700);
    return;
  }

  if (event.target.closest(".archive-task")) {
    postAction("task:archive", { taskId: task.id, archived: true });
    return;
  }

  if (event.target.closest(".restore-task")) {
    postAction("task:archive", { taskId: task.id, archived: false });
    return;
  }

  if (event.target.closest(".edit-task")) {
    openDialog(task);
    return;
  }

  if (event.target.closest(".delete-task") && confirm("删除这个任务吗？")) {
    postAction("task:delete", { taskId: task.id });
    return;
  }

  openTaskDetail(task);
});

document.addEventListener("mouseover", event => {
  const target = event.target.closest("[data-hover-card]");
  if (target) showHoverCard(target, event);
});

document.addEventListener("pointerover", event => {
  const target = event.target.closest("[data-hover-card]");
  if (target) showHoverCard(target, event);
});

document.addEventListener("mousemove", event => {
  if (event.target.closest("[data-hover-card]")) moveHoverCard(event);
});

document.addEventListener("pointermove", event => {
  if (event.target.closest("[data-hover-card]")) moveHoverCard(event);
});

document.addEventListener("mouseout", event => {
  const target = event.target.closest("[data-hover-card]");
  if (target && !target.contains(event.relatedTarget)) hideHoverCard();
});

document.addEventListener("pointerout", event => {
  const target = event.target.closest("[data-hover-card]");
  if (target && !target.contains(event.relatedTarget)) hideHoverCard();
});

taskList.addEventListener("submit", submitTaskMessage);

function submitTaskMessage(event) {
  event.preventDefault();
  const card = event.target.closest(".task-card");
  const input = event.target.elements.body;
  postAction("message:create", {
    taskId: card.dataset.taskId,
    channel: "task",
    userId: currentUserId,
    body: input.value
  });
  input.value = "";
}

openTaskDialog.addEventListener("click", () => openDialog());
closeTaskDialog.addEventListener("click", () => taskDialog.close());
cancelTaskDialog.addEventListener("click", () => taskDialog.close());
closeDetailDialog.addEventListener("click", () => detailDialog.close());
cancelLoginDialog.addEventListener("click", () => loginDialog.close());
skipLoginButton.addEventListener("click", () => {
  if (pendingLoginUserId) loginUser(pendingLoginUserId, "");
});

taskTemplateSelect.addEventListener("change", event => {
  applyTaskTemplate(event.target.value);
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginError.textContent = "";
  try {
    await loginUser(pendingLoginUserId, new FormData(loginForm).get("password"));
  } catch (error) {
    loginError.textContent = error.message;
  }
});

taskForm.addEventListener("submit", event => {
  event.preventDefault();
  const form = new FormData(taskForm);
  const payload = Object.fromEntries(form.entries());
  payload.totalSteps = Number(payload.totalSteps);
  if (payload.taskId) {
    postAction("task:update", payload);
  } else {
    postAction("task:create", payload);
  }
  taskDialog.close();
});

detailBody.addEventListener("change", event => {
  const checkbox = event.target.closest("[data-step-id]");
  if (!checkbox) return;
  if (checkbox.checked) {
    triggerPawBurst(checkbox);
    const allDone = Array.from(detailBody.querySelectorAll('.step-item input[type="checkbox"]')).every(input => input.checked);
    if (allDone) {
      activeMascot.classList.add("mascot-hop");
      window.setTimeout(() => activeMascot.classList.remove("mascot-hop"), 700);
    }
  }
  postAction("step:toggle", {
    taskId: detailDialog.dataset.taskId,
    stepId: checkbox.dataset.stepId,
    userId: currentUserId,
    done: checkbox.checked
  });
});

detailBody.addEventListener("click", event => {
  const moveButton = event.target.closest("[data-step-move]");
  if (moveButton) {
    const stepItem = event.target.closest(".step-item");
    moveStep(stepItem.dataset.stepId, moveButton.dataset.stepMove);
    return;
  }

  if (!event.target.closest(".detail-edit")) return;
  const task = findTask(detailDialog.dataset.taskId);
  detailDialog.close();
  if (task) openDialog(task);
});

detailBody.addEventListener("dragstart", event => {
  const step = event.target.closest(".step-item");
  if (!step || step.getAttribute("draggable") !== "true") return;
  step.classList.add("dragging");
  event.dataTransfer.setData("text/plain", step.dataset.stepId);
  event.dataTransfer.effectAllowed = "move";
});

detailBody.addEventListener("dragend", event => {
  event.target.closest(".step-item")?.classList.remove("dragging");
});

detailBody.addEventListener("dragover", event => {
  const list = event.target.closest(".step-list");
  const over = event.target.closest(".step-item");
  const dragging = detailBody.querySelector(".step-item.dragging");
  if (!list || !over || !dragging || over === dragging) return;
  event.preventDefault();
  const rect = over.getBoundingClientRect();
  const after = event.clientY > rect.top + rect.height / 2;
  list.insertBefore(dragging, after ? over.nextSibling : over);
});

detailBody.addEventListener("drop", event => {
  const list = event.target.closest(".step-list");
  if (!list) return;
  event.preventDefault();
  postAction("step:reorder", {
    taskId: detailDialog.dataset.taskId,
    stepIds: stepIdsFromDetail()
  });
});

messageForm.addEventListener("submit", event => {
  event.preventDefault();
  const form = new FormData(messageForm);
  postAction("message:create", {
    userId: currentUserId,
    channel: "public",
    body: form.get("body")
  });
  messageForm.body.value = "";
});

profileMessageForm.addEventListener("submit", event => {
  event.preventDefault();
  const form = new FormData(profileMessageForm);
  postAction("message:create", {
    userId: currentUserId,
    channel: "profile",
    profileUserId: viewUserId,
    body: form.get("body")
  });
  profileMessageForm.body.value = "";
});

window.addEventListener("popstate", () => applyRouteFromHash());

loadState();
connectEvents();
