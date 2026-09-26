import express from "express";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "5mb" }));

const DB_FILE = path.join(__dirname, "database.json");
const PLAYERS_FILE = path.join(__dirname, "players.json");

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    }
  } catch (e) {
    console.error("DB read error:", e);
  }

  return {
    users: [],
    sessions: {},
    cards: [],
    market: {},
  };
}

let db = loadDb();

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

if (!Array.isArray(db.users)) db.users = [];
if (!Array.isArray(db.cards)) db.cards = [];
if (!db.sessions) db.sessions = {};
if (!db.market) db.market = {};

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "Admin@12345";

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function makeId() {
  return crypto.randomBytes(16).toString("hex");
}

function makePlayerId() {
  let id;

  do {
    id = String(Math.floor(1000000000 + Math.random() * 9000000000));
  } while (db.users.some(u => u.playerId === id));

  return id;
}

function cleanState(user) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    playerId: user.playerId,
    avatar: user.avatar || "",
    title: user.title || "Tân binh",

    coins: Number(user.coins || 0),
    gems: Number(user.gems || 0),
    tickets: Number(user.tickets || 0),

    level: Number(user.level || 1),
    xp: Number(user.xp || 0),

    owned: Array.isArray(user.owned) ? user.owned.slice(0, 5000) : [],

    squad: Array.isArray(user.squad) ? user.squad : [],
    formation: user.formation || "4-3-3",

    packCounts: user.packCounts || {
      bronze: 0,
      silver: 0,
      gold: 0,
      premium: 0
    },

    mailbox: Array.isArray(user.mailbox) ? user.mailbox : [],

    friends: Array.isArray(user.friends) ? user.friends : [],
    friendRequests: Array.isArray(user.friendRequests)
      ? user.friendRequests
      : []
  };
}

function getUserFromToken(req) {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) return null;

  const userId = db.sessions[token];
  if (!userId) return null;

  return db.users.find(u => u.id === userId) || null;
}

function requireLogin(req, res, next) {
  const user = getUserFromToken(req);

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "Bạn chưa đăng nhập"
    });
  }

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = getUserFromToken(req);

  if (!user || !user.isAdmin) {
    return res.status(403).json({
      ok: false,
      error: "Bạn không có quyền admin"
    });
  }

  req.user = user;
  next();
}

/* =========================
   REAL PLAYER DATA
========================= */

const fallbackPlayers = [
  ["Lionel Messi", "Argentina", 91],
  ["Cristiano Ronaldo", "Portugal", 90],
  ["Kylian Mbappe", "France", 91],
  ["Erling Haaland", "Norway", 91],
  ["Jude Bellingham", "England", 90],
  ["Vinicius Junior", "Brazil", 90],
  ["Kevin De Bruyne", "Belgium", 89],
  ["Rodri", "Spain", 91],
  ["Mohamed Salah", "Egypt", 89],
  ["Harry Kane", "England", 90],
  ["Lamine Yamal", "Spain", 89],
  ["Robert Lewandowski", "Poland", 89],
  ["Neymar", "Brazil", 87],
  ["Luka Modric", "Croatia", 86],
  ["Virgil van Dijk", "Netherlands", 89],
  ["Thibaut Courtois", "Belgium", 89],
  ["Alisson Becker", "Brazil", 89],
  ["Bukayo Saka", "England", 88],
  ["Phil Foden", "England", 88],
  ["Pedri", "Spain", 87]
];

function loadPlayers() {
  try {
    if (fs.existsSync(PLAYERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PLAYERS_FILE, "utf8"));

      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (e) {
    console.error("players.json error:", e);
  }

  return fallbackPlayers.map(([name, nation, rating]) => ({
    name,
    nation,
    rating
  }));
}

function normalizePlayer(player, index) {
  if (Array.isArray(player)) {
    return {
      id: String(index + 1),
      name: player[0],
      nation: player[1] || "",
      rating: Number(player[2] || 70),
      position: player[3] || "ST",
      image: player[4] || ""
    };
  }

  return {
    id: String(player.id || index + 1),
    name: player.name || `Player ${index + 1}`,
    nation: player.nation || player.country || "",
    rating: Number(player.rating || player.ovr || 70),
    position: player.position || "ST",
    image: player.image || player.photo || ""
  };
}

function rarityFromOvr(ovr, variant) {
  if (variant >= 5) return "Icon";
  if (ovr >= 90) return "Legendary";
  if (ovr >= 86) return "Epic";
  if (ovr >= 80) return "Rare";
  return "Common";
}

function makeStats(ovr, position) {
  const base = Math.max(45, Math.min(95, ovr));

  let pac = base;
  let sho = base;
  let pas = base;
  let dri = base;
  let def = base;
  let phy = base;

  if (["ST", "CF", "LW", "RW"].includes(position)) {
    pac += 3;
    sho += 4;
    dri += 3;
  }

  if (["CM", "CAM", "CDM"].includes(position)) {
    pas += 5;
    dri += 3;
  }

  if (["CB", "LB", "RB"].includes(position)) {
    def += 6;
    phy += 3;
  }

  if (position === "GK") {
    pac -= 20;
    sho -= 40;
    pas -= 5;
    dri -= 15;
    def += 5;
    phy += 3;
  }

  return {
    PAC: Math.min(99, Math.max(1, Math.round(pac))),
    SHO: Math.min(99, Math.max(1, Math.round(sho))),
    PAS: Math.min(99, Math.max(1, Math.round(pas))),
    DRI: Math.min(99, Math.max(1, Math.round(dri))),
    DEF: Math.min(99, Math.max(1, Math.round(def))),
    PHY: Math.min(99, Math.max(1, Math.round(phy)))
  };
}

function makeCard(player, variant) {
  const ovr = Math.min(
    99,
    Number(player.rating || 70) + (variant >= 5 ? 2 : variant - 1)
  );

  return {
    id: `${player.id}-${variant}`,
    playerId: String(player.id),
    name: player.name,
    nation: player.nation,
    position: player.position || "ST",
    rating: ovr,
    rarity: rarityFromOvr(ovr, variant),
    variant,
    image: player.image || "",
    stats: makeStats(ovr, player.position || "ST")
  };
}

function generateCardCatalog() {
  const players = loadPlayers().map(normalizePlayer);

  const cards = [];

  for (const player of players) {
    for (let variant = 1; variant <= 5; variant++) {
      cards.push(makeCard(player, variant));
    }
  }

  db.cards = cards;
  saveDb();

  return cards;
}

if (!Array.isArray(db.cards) || db.cards.length === 0) {
  generateCardCatalog();
}

console.log(`Loaded ${db.cards.length} cards`);

/* =========================
   HEALTH
========================= */

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "FOOTBALL LEGENDS SERVER",
    cards: db.cards.length,
    players: Math.floor(db.cards.length / 5)
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    cards: db.cards.length,
    players: Math.floor(db.cards.length / 5),
    users: db.users.length
  });
});

/* =========================
   REGISTER
========================= */

app.post("/api/register", (req, res) => {
  const { username, password, nickname } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      ok: false,
      error: "Thiếu tài khoản hoặc mật khẩu"
    });
  }

  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({
      ok: false,
      error: "Tài khoản đã tồn tại"
    });
  }

  const user = {
    id: makeId(),
    username,
    passwordHash: hashPassword(password),
    nickname: nickname || username,
    playerId: makePlayerId(),

    avatar: "",
    title: "Tân binh",

    coins: 10000,
    gems: 100,
    tickets: 5,

    level: 1,
    xp: 0,

    owned: [],
    squad: [],
    formation: "4-3-3",

    packCounts: {
      bronze: 3,
      silver: 1,
      gold: 0,
      premium: 0
    },

    mailbox: [],
    friends: [],
    friendRequests: [],

    isAdmin: username === ADMIN_USER
  };

  db.users.push(user);
  saveDb();

  res.json({
    ok: true,
    user: cleanState(user)
  });
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  const inputUsername = String(username || "").trim();
const inputPassword = String(password || "");

let user = db.users.find(
  u => u.username.toLowerCase() === inputUsername.toLowerCase()
);

if (
  inputUsername.toLowerCase() === String(ADMIN_USER).toLowerCase() &&
  inputPassword === String(ADMIN_PASS)
) {
  if (!user) {
    user = {
      id: makeId(),
      username: ADMIN_USER,
      passwordHash: hashPassword(ADMIN_PASS),
      isAdmin: true,
      role: "admin"
    };

    db.users.push(user);
  } else {
  user.username = ADMIN_USER;
  user.passwordHash = hashPassword(ADMIN_PASS);
  user.isAdmin = true;
  user.role = "admin";
}

  saveDb();
}

if (!user || user.passwordHash !== hashPassword(inputPassword)) {
 
    return res.status(401).json({
      ok: false,
      error: "Sai tài khoản hoặc mật khẩu"
    });
  }

  const token = makeId();
  db.sessions[token] = user.id;

  saveDb();

  res.json({
    ok: true,
    token,
    user: cleanState(user)
  });
});

/* =========================
   LOGOUT
========================= */

app.post("/api/logout", requireLogin, (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  delete db.sessions[token];

  saveDb();

  res.json({ ok: true });
});

/* =========================
   ME
========================= */

app.get("/api/me", requireLogin, (req, res) => {
  res.json({
    ok: true,
    user: cleanState(req.user)
  });
});

/* =========================
   STATE
========================= */

app.get("/api/state", requireLogin, (req, res) => {
  res.json({
    ok: true,
    user: cleanState(req.user)
  });
});

/* =========================
   PLAYER SEARCH
========================= */

app.get("/api/users/:playerId", requireLogin, (req, res) => {
  const target = db.users.find(
    u => u.playerId === String(req.params.playerId)
  );

  if (!target) {
    return res.status(404).json({
      ok: false,
      error: "Không tìm thấy người chơi"
    });
  }

  res.json({
    ok: true,
    user: {
      playerId: target.playerId,
      username: target.username,
      nickname: target.nickname,
      avatar: target.avatar || "",
      title: target.title || "Tân binh",
      level: target.level || 1
    }
  });
});

/* =========================
   FRIEND REQUEST
========================= */

app.post("/api/friends/request", requireLogin, (req, res) => {
  const { playerId } = req.body;

  const target = db.users.find(
    u => u.playerId === String(playerId)
  );

  if (!target) {
    return res.status(404).json({
      ok: false,
      error: "Không tìm thấy người chơi"
    });
  }

  if (target.id === req.user.id) {
    return res.status(400).json({
      ok: false,
      error: "Không thể kết bạn với chính mình"
    });
  }

  if (!Array.isArray(target.friendRequests)) {
    target.friendRequests = [];
  }

  if (!target.friendRequests.includes(req.user.id)) {
    target.friendRequests.push(req.user.id);
  }

  saveDb();

  res.json({ ok: true });
});

/* =========================
   FRIEND ACCEPT
========================= */

app.post("/api/friends/accept", requireLogin, (req, res) => {
  const { userId } = req.body;

  if (!req.user.friendRequests.includes(userId)) {
    return res.status(400).json({
      ok: false,
      error: "Không có lời mời này"
    });
  }

  const target = db.users.find(u => u.id === userId);

  if (!target) {
    return res.status(404).json({
      ok: false,
      error: "Không tìm thấy người chơi"
    });
  }

  req.user.friendRequests =
    req.user.friendRequests.filter(id => id !== userId);

  if (!req.user.friends.includes(userId)) {
    req.user.friends.push(userId);
  }

  if (!target.friends.includes(req.user.id)) {
    target.friends.push(req.user.id);
  }

  saveDb();

  res.json({
    ok: true,
    user: cleanState(req.user)
  });
});

/* =========================
   CARDS
========================= */

app.get("/api/cards", (req, res) => {
  res.json({
    ok: true,
    count: db.cards.length,
    cards: db.cards
  });
});

app.get("/api/cards/:cardId", (req, res) => {
  const card = db.cards.find(c => c.id === req.params.cardId);

  if (!card) {
    return res.status(404).json({
      ok: false,
      error: "Không tìm thấy thẻ"
    });
  }

  res.json({
    ok: true,
    card
  });
});

app.get("/api/cards/stats", (req, res) => {
  const stats = {};

  for (const card of db.cards) {
    stats[card.rarity] = (stats[card.rarity] || 0) + 1;
  }

  res.json({
    ok: true,
    total: db.cards.length,
    rarities: stats
  });
});

/* =========================
   COLLECTION
========================= */

app.get("/api/collection", requireLogin, (req, res) => {
  const collection = req.user.owned
    .map(id => db.cards.find(c => c.id === id))
    .filter(Boolean);

  res.json({
    ok: true,
    count: collection.length,
    cards: collection
  });
});

/* =========================
   PACK OPEN
========================= */

function chooseRarity() {
  const r = Math.random();

  if (r < 0.02) return "Icon";
  if (r < 0.08) return "Legendary";
  if (r < 0.25) return "Epic";
  if (r < 0.60) return "Rare";

  return "Common";
}

app.post("/api/packs/open", requireLogin, (req, res) => {
  const pack = req.body.pack || "bronze";

  const prices = {
    bronze: 1000,
    silver: 2500,
    gold: 5000,
    premium: 10000
  };

  const price = prices[pack];

  if (!price) {
    return res.status(400).json({
      ok: false,
      error: "Loại pack không hợp lệ"
    });
  }

  if (req.user.coins < price) {
    return res.status(400).json({
      ok: false,
      error: "Không đủ xu"
    });
  }

  req.user.coins -= price;

  let possible = db.cards.filter(
    c => c.rarity === chooseRarity()
  );

  if (possible.length === 0) {
    possible = db.cards;
  }

  const card = possible[
    Math.floor(Math.random() * possible.length)
  ];

  req.user.owned.push(card.id);

  saveDb();

  res.json({
    ok: true,
    card,
    user: cleanState(req.user)
  });
});

/* =========================
   GIFTS
========================= */

app.post("/api/gifts", requireLogin, (req, res) => {
  const { playerId, type, amount } = req.body;

  const target = db.users.find(
    u => u.playerId === String(playerId)
  );

  if (!target) {
    return res.status(404).json({
      ok: false,
      error: "Không tìm thấy người nhận"
    });
  }

  const value = Math.max(1, Number(amount || 1));

  if (type === "coins") {
    if (req.user.coins < value) {
      return res.status(400).json({
        ok: false,
        error: "Không đủ xu"
      });
    }

    req.user.coins -= value;
    target.coins += value;
  }

  else if (type === "gems") {
    if (req.user.gems < value) {
      return res.status(400).json({
        ok: false,
        error: "Không đủ Gems"
      });
    }

    req.user.gems -= value;
    target.gems += value;
  }

  else {
    return res.status(400).json({
      ok: false,
      error: "Loại quà không hợp lệ"
    });
  }

  saveDb();

  res.json({
    ok: true,
    user: cleanState(req.user)
  });
});

/* =========================
   MAILBOX
========================= */

app.post("/api/mail/claim", requireLogin, (req, res) => {
  const { mailId } = req.body;

  const index = req.user.mailbox.findIndex(
    m => m.id === mailId
  );

  if (index === -1) {
    return res.status(404).json({
      ok: false,
      error: "Không tìm thấy thư"
    });
  }

  const mail = req.user.mailbox[index];

  if (mail.coins) req.user.coins += Number(mail.coins);
  if (mail.gems) req.user.gems += Number(mail.gems);
  if (mail.tickets) req.user.tickets += Number(mail.tickets);

  if (mail.cardId) {
    req.user.owned.push(mail.cardId);
  }

  req.user.mailbox.splice(index, 1);

  saveDb();

  res.json({
    ok: true,
    user: cleanState(req.user)
  });
});

/* =========================
   MARKET
========================= */

app.get("/api/market", (req, res) => {
  res.json({
    ok: true,
    prices: db.market
  });
});

/* =========================
   ADMIN
========================= */

app.post("/api/admin/grant", requireAdmin, (req, res) => {
  const {
    playerId,
    coins = 0,
    gems = 0,
    tickets = 0,
    pack,
    packAmount = 1
  } = req.body;

  const target = db.users.find(
    u => u.playerId === String(playerId)
  );

  if (!target) {
    return res.status(404).json({
      ok: false,
      error: "Không tìm thấy người chơi"
    });
  }

  target.coins += Number(coins || 0);
  target.gems += Number(gems || 0);
  target.tickets += Number(tickets || 0);

  if (pack) {
    if (!target.packCounts) {
      target.packCounts = {};
    }

    target.packCounts[pack] =
      Number(target.packCounts[pack] || 0) +
      Number(packAmount || 1);
  }

  saveDb();

  res.json({
    ok: true,
    user: cleanState(target)
  });
});

app.post("/api/admin/price", requireAdmin, (req, res) => {
  const { item, price } = req.body;

  db.market[item] = Number(price || 0);

  saveDb();

  res.json({
    ok: true,
    prices: db.market
  });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json({
    ok: true,
    users: db.users.map(u => ({
      playerId: u.playerId,
      username: u.username,
      nickname: u.nickname,
      coins: u.coins,
      gems: u.gems,
      level: u.level,
      cards: u.owned?.length || 0,
      isAdmin: !!u.isAdmin
    }))
  });
});

/* =========================
   REGENERATE CARDS
========================= */

app.post("/api/admin/cards/generate", requireAdmin, (req, res) => {
  const cards = generateCardCatalog();

  res.json({
    ok: true,
    message: "Đã tạo lại hệ thống thẻ",
    cards: cards.length,
    players: Math.floor(cards.length / 5)
  });
});

/* =========================
   CREATE DEFAULT ADMIN
========================= */

let admin = db.users.find(
  u => String(u.username).toLowerCase() === String(ADMIN_USER).toLowerCase()
);

if (!admin) {
  admin = {
    id: makeId(),
    username: ADMIN_USER,
    passwordHash: hashPassword(ADMIN_PASS),
    nickname: "ADMIN",
    playerId: makePlayerId(),
    avatar: "",
    title: "ADMIN",
    coins: 999999999,
    gems: 999999,
    tickets: 99999,
    level: 100,
    xp: 0,
    owned: [],
    squad: [],
    formation: "4-3-3",
    packCounts: {
      bronze: 999,
      silver: 999,
      gold: 999,
      premium: 999
    },
    mailbox: [],
    friends: [],
    friendRequests: [],
    isAdmin: true
  };

  db.users.push(admin);
} else {
  // Đồng bộ lại tài khoản Admin
  admin.passwordHash = hashPassword(ADMIN_PASS);
  admin.isAdmin = true;
  admin.nickname = "ADMIN";
  admin.title = "ADMIN";
}

saveDb();
/* =========================
   START SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Football Legends server running on port ${PORT}`);
  console.log(`Players: ${Math.floor(db.cards.length / 5)}`);
  console.log(`Cards: ${db.cards.length}`);
});
