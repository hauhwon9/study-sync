const http = require("http");
const fs = require("fs");
const path = require("path");
const { createHmac, randomUUID } = require("crypto");

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "app-state.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const AUTH_SECRET = process.env.AUTH_SECRET || "local-study-sync-secret";
const ROLE_PASSWORDS = {
  xiaobai: process.env.XIAOBAI_PASSWORD || "",
  xiaojimao: process.env.JIMAO_PASSWORD || ""
};

const clients = new Set();

const defaultState = {
  users: [
    { id: "xiaobai", name: "小白", color: "#2563eb" },
    { id: "xiaojimao", name: "鸡毛", color: "#d7971f" }
  ],
  tasks: [
    {
      id: randomUUID(),
      ownerId: "xiaobai",
      title: "英语阅读精读",
      subject: "语言",
      dueDate: nextDate(2),
      totalSteps: 5,
      notes: "每天 1 篇，整理生词和长难句。",
      progress: { xiaobai: 2 },
      steps: [
        { id: randomUUID(), title: "选定阅读材料", done: true },
        { id: randomUUID(), title: "通读并标出生词", done: true },
        { id: randomUUID(), title: "整理长难句", done: false },
        { id: randomUUID(), title: "写 100 字复盘", done: false },
        { id: randomUUID(), title: "给对方讲一遍重点", done: false }
      ],
      createdAt: new Date().toISOString()
    },
    {
      id: randomUUID(),
      ownerId: "xiaojimao",
      title: "高数章节复习",
      subject: "数学",
      dueDate: nextDate(5),
      totalSteps: 8,
      notes: "例题、错题、课后题分开推进。",
      progress: { xiaojimao: 4 },
      steps: [
        { id: randomUUID(), title: "复习定义和公式", done: true },
        { id: randomUUID(), title: "整理课堂例题", done: true },
        { id: randomUUID(), title: "完成基础题", done: true },
        { id: randomUUID(), title: "标出错题", done: true },
        { id: randomUUID(), title: "重做错题", done: false },
        { id: randomUUID(), title: "完成提高题", done: false },
        { id: randomUUID(), title: "总结题型", done: false },
        { id: randomUUID(), title: "互相抽查", done: false }
      ],
      createdAt: new Date().toISOString()
    }
  ],
  checkins: [],
  messages: [
    {
      id: randomUUID(),
      taskId: null,
      userId: "xiaojimao",
      body: "今天也一起稳稳推进。",
      createdAt: new Date().toISOString()
    }
  ],
  timeline: [],
  updatedAt: new Date().toISOString()
};

function nextDate(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function ensureStateFile() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultState, null, 2));
  }
}

function readState() {
  ensureStateFile();
  return normalizeState(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
}

function normalizeState(state) {
  const idMap = { you: "xiaobai", partner: "xiaojimao" };
  const nameMap = { xiaobai: "小白", xiaojimao: "鸡毛" };
  const colorMap = { xiaobai: "#2563eb", xiaojimao: "#d7971f" };

  state.users = ["xiaobai", "xiaojimao"].map(id => {
    const oldUser = state.users?.find(user => user.id === id || idMap[user.id] === id);
    return {
      id,
      name: nameMap[id],
      color: colorMap[id]
    };
  });

  state.tasks = (state.tasks || []).map((task, index) => {
    const ownerId = idMap[task.ownerId] || task.ownerId || (index % 2 === 0 ? "xiaobai" : "xiaojimao");
    const oldProgress = task.progress || {};
    const progressValue =
      oldProgress[ownerId] ??
      oldProgress[Object.entries(idMap).find(([, next]) => next === ownerId)?.[0]] ??
      0;
    const totalSteps = clamp(task.totalSteps || task.steps?.length || 1, 1, 99);
    const steps = normalizeSteps(task.steps, totalSteps, progressValue);

    return {
      ...task,
      ownerId,
      steps,
      totalSteps: steps.length,
      progress: { [ownerId]: steps.filter(step => step.done).length }
    };
  });

  state.checkins = (state.checkins || []).map(item => ({
    ...item,
    userId: idMap[item.userId] || item.userId
  }));

  state.messages = (state.messages || []).map(item => ({
    ...item,
    userId: idMap[item.userId] || item.userId,
    channel: item.channel || (item.taskId ? "task" : item.profileUserId ? "profile" : "public"),
    profileUserId: item.profileUserId ? idMap[item.profileUserId] || item.profileUserId : null
  }));

  state.timeline = (state.timeline || []).map(item => ({
    ...item,
    userId: idMap[item.userId] || item.userId,
    taskId: item.taskId || null,
    meta: item.meta || {}
  }));

  return state;
}

function normalizeSteps(steps, totalSteps, progressValue = 0) {
  if (Array.isArray(steps) && steps.length) {
    return steps.slice(0, 99).map((step, index) => ({
      id: step.id || randomUUID(),
      title: cleanText(step.title, `步骤 ${index + 1}`).slice(0, 120) || `步骤 ${index + 1}`,
      done: Boolean(step.done)
    }));
  }

  return Array.from({ length: totalSteps }, (_, index) => ({
    id: randomUUID(),
    title: `步骤 ${index + 1}`,
    done: index < progressValue
  }));
}

function stepsFromPayload(payload, existingSteps = []) {
  const lines = String(payload.stepsText || "")
    .split(/\r?\n/)
    .map(line => cleanText(line).slice(0, 120))
    .filter(Boolean)
    .slice(0, 99);

  if (lines.length) {
    return lines.map((title, index) => ({
      id: existingSteps[index]?.id || randomUUID(),
      title,
      done: Boolean(existingSteps[index]?.done)
    }));
  }

  const totalSteps = clamp(payload.totalSteps, 1, 99);
  return Array.from({ length: totalSteps }, (_, index) => ({
    id: existingSteps[index]?.id || randomUUID(),
    title: existingSteps[index]?.title || `步骤 ${index + 1}`,
    done: Boolean(existingSteps[index]?.done)
  }));
}

function writeState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  broadcast(state);
}

function broadcast(state) {
  const payload = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
  for (const client of clients) client.write(payload);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function cleanText(value, fallback = "") {
  return String(value ?? fallback).trim().slice(0, 500);
}

function addTimeline(state, entry) {
  state.timeline = state.timeline || [];
  state.timeline.unshift({
    id: randomUUID(),
    type: cleanText(entry.type, "activity").slice(0, 40),
    userId: entry.userId,
    taskId: entry.taskId || null,
    body: cleanText(entry.body).slice(0, 240),
    meta: entry.meta || {},
    createdAt: new Date().toISOString()
  });
  state.timeline = state.timeline.slice(0, 200);
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value) {
  return createHmac("sha256", AUTH_SECRET).update(value).digest("base64url");
}

function createToken(userId) {
  const payload = JSON.stringify({
    userId,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30
  });
  const encoded = base64Url(payload);
  return `${encoded}.${sign(encoded)}`;
}

function verifyToken(userId, token) {
  if (!ROLE_PASSWORDS[userId]) return true;
  if (!token || typeof token !== "string") return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || sign(encoded) !== signature) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload.userId === userId && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function actorFromAction(action) {
  const userId = action?.auth?.userId;
  if (!userId || !verifyToken(userId, action.auth?.token)) {
    throw new Error("需要先输入口令进入自己的板块");
  }
  return userId;
}

function applyAction(state, action, actorId) {
  const payload = action.payload || {};

  if (action.type === "profile:update") {
    if (payload.userId !== actorId) return state;
    const user = state.users.find(item => item.id === payload.userId);
    if (user) user.name = cleanText(payload.name, user.name).slice(0, 24) || user.name;
    return state;
  }

  if (action.type === "task:create") {
    const owner = state.users.find(user => user.id === payload.ownerId) || state.users[0];
    if (owner.id !== actorId) return state;
    const steps = stepsFromPayload(payload);
    const task = {
      id: randomUUID(),
      ownerId: owner.id,
      title: cleanText(payload.title, "新学习任务").slice(0, 80) || "新学习任务",
      subject: cleanText(payload.subject, "学习").slice(0, 32) || "学习",
      dueDate: cleanText(payload.dueDate).slice(0, 10),
      totalSteps: steps.length,
      notes: cleanText(payload.notes).slice(0, 240),
      steps,
      progress: { [owner.id]: 0 },
      createdAt: new Date().toISOString()
    };
    state.tasks.unshift(task);
    addTimeline(state, {
      type: "task:create",
      userId: owner.id,
      taskId: task.id,
      body: `新建任务：${task.title}`,
      meta: { title: task.title, dueDate: task.dueDate }
    });
    return state;
  }

  if (action.type === "task:update") {
    const task = state.tasks.find(item => item.id === payload.taskId);
    if (!task) return state;
    if (task.ownerId !== actorId) return state;
    task.title = cleanText(payload.title, task.title).slice(0, 80) || task.title;
    task.subject = cleanText(payload.subject, task.subject).slice(0, 32) || task.subject;
    task.dueDate = cleanText(payload.dueDate).slice(0, 10);
    task.notes = cleanText(payload.notes).slice(0, 240);
    task.steps = stepsFromPayload(payload, task.steps || []);
    task.totalSteps = task.steps.length;
    const owner = state.users.find(user => user.id === payload.ownerId);
    if (owner) {
      task.ownerId = owner.id;
    }
    task.progress = { [task.ownerId]: task.steps.filter(step => step.done).length };
    addTimeline(state, {
      type: "task:update",
      userId: task.ownerId,
      taskId: task.id,
      body: `更新任务：${task.title}`,
      meta: { title: task.title, dueDate: task.dueDate }
    });
    return state;
  }

  if (action.type === "task:delete") {
    const task = state.tasks.find(item => item.id === payload.taskId);
    if (!task || task.ownerId !== actorId) return state;
    state.tasks = state.tasks.filter(task => task.id !== payload.taskId);
    state.messages = state.messages.filter(message => message.taskId !== payload.taskId);
    addTimeline(state, {
      type: "task:delete",
      userId: actorId,
      taskId: payload.taskId,
      body: `删除任务：${task.title}`,
      meta: { title: task.title }
    });
    return state;
  }

  if (action.type === "progress:set") {
    const task = state.tasks.find(item => item.id === payload.taskId);
    const user = state.users.find(item => item.id === payload.userId);
    if (!task || !user || task.ownerId !== user.id || user.id !== actorId) return state;
    const value = clamp(payload.value, 0, task.totalSteps);
    task.steps = normalizeSteps(task.steps, task.totalSteps, value).map((step, index) => ({
      ...step,
      done: index < value
    }));
    task.progress[user.id] = task.steps.filter(step => step.done).length;
    addTimeline(state, {
      type: value === task.totalSteps ? "task:complete" : "progress:set",
      userId: user.id,
      taskId: task.id,
      body: value === task.totalSteps ? `完成任务：${task.title}` : `更新进度：${task.title} ${value}/${task.totalSteps}`,
      meta: { value, totalSteps: task.totalSteps, title: task.title }
    });
    return state;
  }

  if (action.type === "step:toggle") {
    const task = state.tasks.find(item => item.id === payload.taskId);
    const user = state.users.find(item => item.id === payload.userId);
    if (!task || !user || task.ownerId !== user.id || user.id !== actorId) return state;
    const step = task.steps?.find(item => item.id === payload.stepId);
    if (!step) return state;
    step.done = Boolean(payload.done);
    task.totalSteps = task.steps.length;
    task.progress[user.id] = task.steps.filter(item => item.done).length;
    addTimeline(state, {
      type: step.done ? "step:done" : "step:undone",
      userId: user.id,
      taskId: task.id,
      body: `${step.done ? "完成步骤" : "取消步骤"}：${step.title}`,
      meta: { stepTitle: step.title, taskTitle: task.title, progress: task.progress[user.id], totalSteps: task.totalSteps }
    });
    if (step.done && task.progress[user.id] === task.totalSteps) {
      addTimeline(state, {
        type: "task:complete",
        userId: user.id,
        taskId: task.id,
        body: `完成任务：${task.title}`,
        meta: { title: task.title, totalSteps: task.totalSteps }
      });
    }
    return state;
  }

  if (action.type === "step:reorder") {
    const task = state.tasks.find(item => item.id === payload.taskId);
    if (!task || task.ownerId !== actorId || !Array.isArray(payload.stepIds)) return state;
    const byId = new Map((task.steps || []).map(step => [step.id, step]));
    const ordered = payload.stepIds.map(id => byId.get(id)).filter(Boolean);
    const leftovers = (task.steps || []).filter(step => !payload.stepIds.includes(step.id));
    task.steps = [...ordered, ...leftovers];
    task.totalSteps = task.steps.length;
    task.progress[task.ownerId] = task.steps.filter(step => step.done).length;
    addTimeline(state, {
      type: "step:reorder",
      userId: actorId,
      taskId: task.id,
      body: `调整步骤顺序：${task.title}`,
      meta: { title: task.title }
    });
    return state;
  }

  if (action.type === "checkin:create") {
    const user = state.users.find(item => item.id === payload.userId);
    if (!user || user.id !== actorId) return state;
    state.checkins.unshift({
      id: randomUUID(),
      userId: user.id,
      mood: cleanText(payload.mood, "ok").slice(0, 20),
      summary: cleanText(payload.summary).slice(0, 240),
      minutes: clamp(payload.minutes, 0, 1440),
      createdAt: new Date().toISOString()
    });
    state.checkins = state.checkins.slice(0, 80);
    return state;
  }

  if (action.type === "message:create") {
    const user = state.users.find(item => item.id === payload.userId);
    if (!user || user.id !== actorId) return state;
    const body = cleanText(payload.body).slice(0, 500);
    if (!body) return state;
    state.messages.unshift({
      id: randomUUID(),
      taskId: payload.taskId || null,
      channel: cleanText(payload.channel, payload.taskId ? "task" : "public").slice(0, 20),
      profileUserId: payload.profileUserId || null,
      userId: user.id,
      body,
      createdAt: new Date().toISOString()
    });
    state.messages = state.messages.slice(0, 160);
    addTimeline(state, {
      type: payload.taskId ? "message:task" : payload.profileUserId ? "message:profile" : "message:public",
      userId: user.id,
      taskId: payload.taskId || null,
      body,
      meta: { profileUserId: payload.profileUserId || null }
    });
    return state;
  }

  return state;
}

function serveStatic(req, res) {
  const rawPath = decodeURIComponent(req.url.split("?")[0]);
  const safePath = rawPath === "/" ? "/index.html" : rawPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    };

    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/api/state" && req.method === "GET") {
    sendJson(res, 200, readState());
    return;
  }

  if (req.url === "/api/login" && req.method === "POST") {
    try {
      const payload = await readBody(req);
      const user = readState().users.find(item => item.id === payload.userId);
      if (!user) {
        sendJson(res, 404, { error: "角色不存在" });
        return;
      }
      const expected = ROLE_PASSWORDS[user.id];
      if (expected && payload.password !== expected) {
        sendJson(res, 401, { error: "口令不对" });
        return;
      }
      sendJson(res, 200, {
        userId: user.id,
        token: createToken(user.id),
        passwordRequired: Boolean(expected)
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.url === "/api/action" && req.method === "POST") {
    try {
      const action = await readBody(req);
      const actorId = actorFromAction(action);
      const state = applyAction(readState(), action, actorId);
      writeState(state);
      sendJson(res, 200, state);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.url === "/events" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive"
    });
    res.write(`event: state\ndata: ${JSON.stringify(readState())}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Study Sync is running at http://localhost:${PORT}`);
  console.log(`On the same Wi-Fi, your partner can open http://YOUR-LAN-IP:${PORT}`);
});
