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
const DB_FILE = path.join(__dirname, "database.json");
const PLAYERS_FILE = path.join(__dirname, "players.json");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "5mb" }));

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
    market: {}
  };
}

let db = loadDb();

if (!Array.isArray(db.users)) db.users = [];
if (!db.sessions || typeof db.sessions !== "object") db.sessions = {};
if (!Array.isArray(db.cards)) db.cards = [];
if (!db.market || typeof db.market !== "object") db.market = {};

function saveDb() {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2)
  );
}

const ADMIN_USER =
  process.env.ADMIN_USER || "admin";

const ADMIN_PASS =
  process.env.ADMIN_PASS || "Admin@12345";

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
}

function makeId() {
  return crypto.randomBytes(16).toString("hex");
}

function makePlayerId() {
  let id;

  do {
    id = String(
      Math.floor(
        1000000000 +
        Math.random() * 9000000000
      )
    );
  } while (
    db.users.some(
      u => u.playerId === id
    )
  );

  return id;
}

function cleanState(user) {
  return {
    id: user.id,
    username: user.username,

    nickname:
      user.nickname ||
      user.username,

    playerId:
      user.playerId,

    avatar:
      user.avatar ||
      "⚽",

    title:
      user.title ||
      "Tân binh",

    role:
      user.isAdmin
        ? "admin"
        : "player",

    isAdmin:
      !!user.isAdmin,

    coins:
      Number(user.coins || 0),

    gems:
      Number(user.gems || 0),

    tickets:
      Number(user.tickets || 0),

    level:
      Number(user.level || 1),

    xp:
      Number(user.xp || 0),

    joinedAt:
      user.joinedAt || "",

    owned:
      Array.isArray(user.owned)
        ? user.owned.slice(0, 5000)
        : [],

    squad:
      Array.isArray(user.squad)
        ? user.squad.slice(0, 20)
        : [],

    formation:
      user.formation ||
      "4-3-3",

    packCounts:
      user.packCounts || {
        bronze: 0,
        silver: 0,
        gold: 0,
        premium: 0
      },

    mailbox:
      Array.isArray(user.mailbox)
        ? user.mailbox.slice(0, 500)
        : [],

    friends:
      Array.isArray(user.friends)
        ? user.friends
        : [],

    friendRequests:
      Array.isArray(user.friendRequests)
        ? user.friendRequests
        : []
  };
}

function getUserFromToken(req) {
  const token =
    req.headers.authorization?.replace(
      /^Bearer\s+/i,
      ""
    );

  if (!token) return null;

  const userId =
    db.sessions[token];

  if (!userId) return null;

  return (
    db.users.find(
      u => u.id === userId
    ) || null
  );
}

function requireLogin(
  req,
  res,
  next
) {
  const user =
    getUserFromToken(req);

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "Bạn chưa đăng nhập"
    });
  }

  req.user = user;
  next();
}

function requireAdmin(
  req,
  res,
  next
) {
  const user =
    getUserFromToken(req);

  if (!user || !user.isAdmin) {
    return res.status(403).json({
      ok: false,
      error:
        "Bạn không có quyền admin"
    });
  }

  req.user = user;
  next();
}

/* =========================================================
   PLAYER DATA
========================================================= */

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
      const data =
        JSON.parse(
          fs.readFileSync(
            PLAYERS_FILE,
            "utf8"
          )
        );

      if (
        Array.isArray(data) &&
        data.length
      ) {
        return data;
      }
    }
  } catch (e) {
    console.error(
      "players.json error:",
      e
    );
  }

  return fallbackPlayers.map(
    ([name, nation, rating]) => ({
      name,
      nation,
      rating
    })
  );
}

function normalizePlayer(
  player,
  index
) {
  if (Array.isArray(player)) {
    return {
      id:
        String(index + 1),

      name:
        player[0],

      nation:
        player[1] || "",

      rating:
        Number(
          player[2] || 70
        ),

      position:
        player[3] || "ST",

      image:
        player[4] || ""
    };
  }

  return {
    id:
      String(
        player.id ||
        index + 1
      ),

    name:
      player.name ||
      `Player ${index + 1}`,

    nation:
      player.nation ||
      player.country ||
      "",

    rating:
      Number(
        player.rating ||
        player.ovr ||
        70
      ),

    position:
      player.position ||
      "ST",

    image:
      player.image ||
      player.photo ||
      ""
  };
}

function rarityFromOvr(
  ovr,
  variant
) {
  if (variant >= 5)
    return "Icon";

  if (ovr >= 90)
    return "Legendary";

  if (ovr >= 86)
    return "Epic";

  if (ovr >= 80)
    return "Rare";

  return "Common";
}

function makeStats(
  ovr,
  position
) {
  const base =
    Math.max(
      45,
      Math.min(
        95,
        ovr
      )
    );

  let pac = base;
  let sho = base;
  let pas = base;
  let dri = base;
  let def = base;
  let phy = base;

  if (
    ["ST", "CF", "LW", "RW"]
      .includes(position)
  ) {
    pac += 3;
    sho += 4;
    dri += 3;
  }

  if (
    ["CM", "CAM", "CDM"]
      .includes(position)
  ) {
    pas += 5;
    dri += 3;
  }

  if (
    ["CB", "LB", "RB"]
      .includes(position)
  ) {
    def += 6;
    phy += 3;
  }

  if (
    position === "GK"
  ) {
    pac -= 20;
    sho -= 40;
    pas -= 5;
    dri -= 15;
    def += 5;
    phy += 3;
  }

  return {
    PAC: Math.min(
      99,
      Math.max(
        1,
        Math.round(pac)
      )
    ),

    SHO: Math.min(
      99,
      Math.max(
        1,
        Math.round(sho)
      )
    ),

    PAS: Math.min(
      99,
      Math.max(
        1,
        Math.round(pas)
      )
    ),

    DRI: Math.min(
      99,
      Math.max(
        1,
        Math.round(dri)
      )
    ),

    DEF: Math.min(
      99,
      Math.max(
        1,
        Math.round(def)
      )
    ),

    PHY: Math.min(
      99,
      Math.max(
        1,
        Math.round(phy)
      )
    )
  };
}

function makeCard(
  player,
  variant
) {
  const ovr =
    Math.min(
      99,
      Number(
        player.rating || 70
      ) +
      (
        variant >= 5
          ? 2
          : variant - 1
      )
    );

  return {
    id:
      `${player.id}-${variant}`,

    playerId:
      String(player.id),

    name:
      player.name,

    nation:
      player.nation,

    position:
      player.position ||
      "ST",

    rating:
      ovr,

    rarity:
      rarityFromOvr(
        ovr,
        variant
      ),

    variant,

    image:
      player.image || "",

    stats:
      makeStats(
        ovr,
        player.position ||
        "ST"
      )
  };
}

function generateCardCatalog() {
  const basePlayers =
    loadPlayers()
      .map(normalizePlayer);

  const cards = [];

  for (
    const player of basePlayers
  ) {
    for (
      let variant = 1;
      variant <= 5;
      variant++
    ) {
      cards.push(
        makeCard(
          player,
          variant
        )
      );
    }
  }

  db.cards = cards;

  saveDb();

  return cards;
}

if (!db.cards.length) {
  generateCardCatalog();
}

/* =========================================================
   USER SHAPE
========================================================= */

function ensureUserShape(
  user
) {
  if (!user.playerId) {
    user.playerId =
      makePlayerId();
  }

  if (!user.avatar) {
    user.avatar = "⚽";
  }

  if (!user.title) {
    user.title =
      user.isAdmin
        ? "ADMIN"
        : "Tân binh";
  }

  if (
    !Array.isArray(
      user.owned
    )
  ) {
    user.owned = [];
  }

  if (
    !Array.isArray(
      user.squad
    )
  ) {
    user.squad = [];
  }

  if (!user.formation) {
    user.formation =
      "4-3-3";
  }

  if (
    !user.packCounts
  ) {
    user.packCounts = {
      bronze: 0,
      silver: 0,
      gold: 0,
      premium: 0
    };
  }

  if (
    !Array.isArray(
      user.mailbox
    )
  ) {
    user.mailbox = [];
  }

  if (
    !Array.isArray(
      user.friends
    )
  ) {
    user.friends = [];
  }

  if (
    !Array.isArray(
      user.friendRequests
    )
  ) {
    user.friendRequests = [];
  }

  if (
    !Number.isFinite(
      Number(user.coins)
    )
  ) {
    user.coins = 0;
  }

  if (
    !Number.isFinite(
      Number(user.gems)
    )
  ) {
    user.gems = 0;
  }

  if (
    !Number.isFinite(
      Number(user.tickets)
    )
  ) {
    user.tickets = 0;
  }

  if (
    !Number.isFinite(
      Number(user.level)
    )
  ) {
    user.level = 1;
  }

  if (
    !Number.isFinite(
      Number(user.xp)
    )
  ) {
    user.xp = 0;
  }
}

for (
  const user of db.users
) {
  ensureUserShape(user);
}

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/",
  (req, res) => {
    res.json({
      ok: true,
      message:
        "FOOTBALL LEGENDS SERVER",
      cards:
        db.cards.length,
      players:
        Math.floor(
          db.cards.length / 5
        )
    });
  }
);

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,
      cards:
        db.cards.length,
      players:
        Math.floor(
          db.cards.length / 5
        ),
      users:
        db.users.length
    });
  }
);

/* =========================================================
   REGISTER
========================================================= */

app.post(
  "/api/register",
  (req, res) => {

    const username =
      String(
        req.body.username ||
        ""
      ).trim();

    const password =
      String(
        req.body.password ||
        ""
      );

    const nickname =
      String(
        req.body.nickname ||
        username
      ).trim() ||
      username;

    if (
      !/^[A-Za-z0-9_]{3,24}$/
        .test(username)
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Tài khoản 3-24 ký tự, chỉ chữ/số/_"
        });
    }

    if (
      password.length < 6
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Mật khẩu tối thiểu 6 ký tự"
        });
    }

    if (
      db.users.some(
        u =>
          String(
            u.username
          ).toLowerCase() ===
          username.toLowerCase()
      )
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Tài khoản đã tồn tại"
        });
    }

    const user = {

      id:
        makeId(),

      username,

      passwordHash:
        hashPassword(
          password
        ),

      nickname,

      playerId:
        makePlayerId(),

      avatar:
        "⚽",

      title:
        username.toLowerCase() ===
        ADMIN_USER.toLowerCase()
          ? "ADMIN"
          : "Tân binh",

      coins:
        10000,

      gems:
        100,

      tickets:
        5,

      level:
        1,

      xp:
        0,

      joinedAt:
        new Date().toISOString(),

      owned: [],

      squad: [],

      formation:
        "4-3-3",

      packCounts: {
        bronze: 3,
        silver: 1,
        gold: 0,
        premium: 0
      },

      mailbox: [],

      friends: [],

      friendRequests: [],

      isAdmin:
        username.toLowerCase() ===
        ADMIN_USER.toLowerCase()
    };

    db.users.push(user);

    saveDb();

    res.json({
      ok: true,
      user:
        cleanState(user)
    });

  }
);

/* =========================================================
   LOGIN
========================================================= */

app.post(
  "/api/login",
  (req, res) => {

    const username =
      String(
        req.body.username ||
        ""
      ).trim();

    const password =
      String(
        req.body.password ||
        ""
      );

    let user =
      db.users.find(
        u =>
          String(
            u.username
          ).toLowerCase() ===
          username.toLowerCase()
      );

    if (
      username.toLowerCase() ===
        ADMIN_USER.toLowerCase() &&
      password ===
        ADMIN_PASS
    ) {

      if (!user) {

        user = {

          id:
            makeId(),

          username:
            ADMIN_USER,

          passwordHash:
            hashPassword(
              ADMIN_PASS
            ),

          nickname:
            "ADMIN",

          playerId:
            makePlayerId(),

          avatar:
            "👑",

          title:
            "ADMIN",

          coins:
            999999999,

          gems:
            999999,

          tickets:
            99999,

          level:
            100,

          xp:
            0,

          joinedAt:
            new Date().toISOString(),

          owned: [],

          squad: [],

          formation:
            "4-3-3",

          packCounts: {
            bronze: 999,
            silver: 999,
            gold: 999,
            premium: 999
          },

          mailbox: [],

          friends: [],

          friendRequests: [],

          isAdmin:
            true

        };

        db.users.push(
          user
        );

      } else {

        user.username =
          ADMIN_USER;

        user.passwordHash =
          hashPassword(
            ADMIN_PASS
          );

        user.isAdmin =
          true;

        user.nickname =
          "ADMIN";

        user.title =
          "ADMIN";
      }

      ensureUserShape(
        user
      );
    }

    if (
      !user ||
      user.passwordHash !==
        hashPassword(
          password
        )
    ) {

      return res
        .status(401)
        .json({
          ok: false,
          error:
            "Sai tài khoản hoặc mật khẩu"
        });

    }

    ensureUserShape(
      user
    );

    const token =
      makeId();

    db.sessions[token] =
      user.id;

    saveDb();

    res.json({
      ok: true,
      token,
      user:
        cleanState(user)
    });

  }
);

/* =========================================================
   LOGOUT
========================================================= */

app.post(
  "/api/logout",
  requireLogin,
  (req, res) => {

    const token =
      req.headers.authorization
        ?.replace(
          /^Bearer\s+/i,
          ""
        );

    if (token) {
      delete db.sessions[
        token
      ];
    }

    saveDb();

    res.json({
      ok: true
    });

  }
);

/* =========================================================
   ME
========================================================= */

app.get(
  "/api/me",
  requireLogin,
  (req, res) => {

    res.json({
      ok: true,
      user:
        cleanState(
          req.user
        )
    });

  }
);

/* =========================================================
   STATE
========================================================= */

app.get(
  "/api/state",
  requireLogin,
  (req, res) => {

    res.json({
      ok: true,
      user:
        cleanState(
          req.user
        )
    });

  }
);

app.put(
  "/api/state",
  requireLogin,
  (req, res) => {

    const state =
      req.body?.state ||
      {};

    const user =
      req.user;

    if (
      state.coins !==
      undefined
    ) {
      user.coins =
        Math.max(
          0,
          Math.floor(
            Number(
              state.coins
            ) || 0
          )
        );
    }

    if (
      state.gems !==
      undefined
    ) {
      user.gems =
        Math.max(
          0,
          Math.floor(
            Number(
              state.gems
            ) || 0
          )
        );
    }

    if (
      state.tickets !==
      undefined
    ) {
      user.tickets =
        Math.max(
          0,
          Math.floor(
            Number(
              state.tickets
            ) || 0
          )
        );
    }

    if (
      Array.isArray(
        state.owned
      )
    ) {
      user.owned =
        state.owned.slice(
          0,
          5000
        );
    }

    if (
      Array.isArray(
        state.squad
      )
    ) {
      user.squad =
        state.squad.slice(
          0,
          20
        );
    }

    if (
      typeof state.formation ===
      "string"
    ) {
      user.formation =
        state.formation;
    }

    if (
      state.packCounts &&
      typeof
        state.packCounts ===
        "object"
    ) {
      user.packCounts = {
        ...user.packCounts,
        ...state.packCounts
      };
    }

    if (
      Number.isFinite(
        Number(
          state.level
        )
      )
    ) {
      user.level =
        Math.max(
          1,
          Math.floor(
            Number(
              state.level
            )
          )
        );
    }

    if (
      Number.isFinite(
        Number(
          state.xp
        )
      )
    ) {
      user.xp =
        Math.max(
          0,
          Math.floor(
            Number(
              state.xp
            )
          )
        );
    }

    if (
      typeof state.avatar ===
      "string" &&
      state.avatar.length <= 8
    ) {
      user.avatar =
        state.avatar;
    }

    ensureUserShape(
      user
    );

    saveDb();

    res.json({
      ok: true,
      user:
        cleanState(
          user
        )
    });

  }
);

/* =========================================================
   USER SEARCH
========================================================= */

app.get(
  "/api/users/:playerId",
  requireLogin,
  (req, res) => {

    const target =
      db.users.find(
        u =>
          u.playerId ===
          String(
            req.params.playerId
          )
      );

    if (!target) {

      return res
        .status(404)
        .json({
          ok: false,
          error:
            "Không tìm thấy người chơi"
        });

    }

    res.json({
      ok: true,
      user: {

        playerId:
          target.playerId,

        username:
          target.username,

        nickname:
          target.nickname,

        avatar:
          target.avatar ||
          "⚽",

        title:
          target.title ||
          "Tân binh",

        level:
          target.level ||
          1
      }
    });

  }
);

/* =========================================================
   FRIENDS
========================================================= */

app.get(
  "/api/friends",
  requireLogin,
  (req, res) => {

    const friendUsers =
      req.user.friends
        .map(
          id =>
            db.users.find(
              u =>
                u.id === id
            )
        )
        .filter(Boolean)
        .map(
          u => ({
            playerId:
              u.playerId,

            username:
              u.username,

            nickname:
              u.nickname,

            avatar:
              u.avatar,

            title:
              u.title,

            level:
              u.level
          })
        );

    const requests =
      req.user.friendRequests
        .map(
          id =>
            db.users.find(
              u =>
                u.id === id
            )
        )
        .filter(Boolean)
        .map(
          u => ({
            id:
              u.id,

            playerId:
              u.playerId,

            username:
              u.username,

            nickname:
              u.nickname,

            avatar:
              u.avatar,

            title:
              u.title,

            level:
              u.level
          })
        );

    res.json({
      ok: true,
      friends:
        friendUsers,
      requests
    });

  }
);

app.post(
  "/api/friends/request",
  requireLogin,
  (req, res) => {

    const playerId =
      String(
        req.body.playerId ||
        ""
      );

    const target =
      db.users.find(
        u =>
          u.playerId ===
          playerId
      );

    if (!target) {

      return res
        .status(404)
        .json({
          ok: false,
          error:
            "Không tìm thấy người chơi"
        });

    }

    if (
      target.id ===
      req.user.id
    ) {

      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Không thể kết bạn với chính mình"
        });

    }

    if (
      !Array.isArray(
        target.friendRequests
      )
    ) {
      target.friendRequests =
        [];
    }

    if (
      !target.friendRequests.includes(
        req.user.id
      )
    ) {
      target.friendRequests.push(
        req.user.id
      );
    }

    saveDb();

    res.json({
      ok: true
    });

  }
);

app.post(
  "/api/friends/accept",
  requireLogin,
  (req, res) => {

    const userId =
      String(
        req.body.userId ||
        ""
      );

    if (
      !req.user.friendRequests.includes(
        userId
      )
    ) {

      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Không có lời mời này"
        });

    }

    const target =
      db.users.find(
        u =>
          u.id ===
          userId
      );

    if (!target) {

      return res
        .status(404)
        .json({
          ok: false,
          error:
            "Không tìm thấy người chơi"
        });

    }

    req.user.friendRequests =
      req.user.friendRequests.filter(
        id =>
          id !== userId
      );

    if (
      !req.user.friends.includes(
        userId
      )
    ) {
      req.user.friends.push(
        userId
      );
    }

    if (
      !target.friends.includes(
        req.user.id
      )
    ) {
      target.friends.push(
        req.user.id
      );
    }

    saveDb();

    res.json({
      ok: true,
      user:
        cleanState(
          req.user
        )
    });

  }
);

/* =========================================================
   CARDS
========================================================= */

app.get(
  "/api/cards",
  (req, res) => {

    res.json({
      ok: true,
      count:
        db.cards.length,
      cards:
        db.cards
    });

  }
);

app.get(
  "/api/collection",
  requireLogin,
  (req, res) => {

    const collection =
      req.user.owned
        .map(
          id =>
            db.cards.find(
              c =>
                c.id === id
            )
        )
        .filter(Boolean);

    res.json({
      ok: true,
      count:
        collection.length,
      cards:
        collection
    });

  }
);

/* =========================================================
   PACK
========================================================= */

function packPrice(
  pack
) {
  return (
    {
      bronze: 5000,
      silver: 15000,
      gold: 50000,
      premium: 150000
    }[pack] || 0
  );
}

function allowedRarities(
  pack
) {

  if (
    pack === "premium"
  ) {
    return [
      "Legendary",
      "Icon",
      "Epic",
      "Rare"
    ];
  }

  if (
    pack === "gold"
  ) {
    return [
      "Legendary",
      "Epic",
      "Rare"
    ];
  }

  if (
    pack === "silver"
  ) {
    return [
      "Epic",
      "Rare",
      "Common"
    ];
  }

  return [
    "Rare",
    "Common"
  ];
}

function choosePackCard(
  pack
) {

  const allowed =
    allowedRarities(
      pack
    );

  let pool =
    db.cards.filter(
      c =>
        allowed.includes(
          c.rarity
        )
    );

  if (!pool.length) {
    pool = db.cards;
  }

  return pool[
    Math.floor(
      Math.random() *
      pool.length
    )
  ];
}

app.post(
  "/api/packs/open",
  requireLogin,
  (req, res) => {

    const pack =
      String(
        req.body.pack ||
        "bronze"
      );

    const price =
      packPrice(
        pack
      );

    if (!price) {

      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Loại pack không hợp lệ"
        });

    }

    ensureUserShape(
      req.user
    );

    const free =
      Number(
        req.user.packCounts[
          pack
        ] || 0
      );

    if (free > 0) {

      req.user.packCounts[
        pack
      ] =
        free - 1;

    } else {

      if (
        req.user.coins <
        price
      ) {

        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Không đủ xu"
          });

      }

      req.user.coins -=
        price;
    }

    const cards = [];

    for (
      let i = 0;
      i < 5;
      i++
    ) {

      const card =
        choosePackCard(
          pack
        );

      cards.push(
        card
      );

      req.user.owned.push(
        card.id
      );

    }

    saveDb();

    res.json({
      ok: true,
      cards,
      user:
        cleanState(
          req.user
        )
    });

  }
);

/* =========================================================
   GIFTS
========================================================= */

app.post(
  "/api/gifts",
  requireLogin,
  (req, res) => {

    const playerId =
      String(
        req.body.playerId ||
        ""
      );

    const type =
      String(
        req.body.type ||
        ""
      );

    const amount =
      Math.max(
        1,
        Math.floor(
          Number(
            req.body.amount ||
            1
          )
        )
      );

    const target =
      db.users.find(
        u =>
          u.playerId ===
          playerId
      );

    if (!target) {

      return res
        .status(404)
        .json({
          ok: false,
          error:
            "Không tìm thấy người nhận"
        });

    }

    if (
      target.id ===
      req.user.id
    ) {

      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Không thể gửi quà cho chính mình"
        });

    }

    if (
      type === "coins"
    ) {

      if (
        req.user.coins <
        amount
      ) {

        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Không đủ xu"
          });

      }

      req.user.coins -=
        amount;

      target.coins +=
        amount;

    } else if (
      type === "gems"
    ) {

      if (
        req.user.gems <
        amount
      ) {

        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Không đủ Gems"
          });

      }

      req.user.gems -=
        amount;

      target.gems +=
        amount;

    } else {

      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Loại quà không hợp lệ"
        });

    }

    saveDb();

    res.json({
      ok: true,
      user:
        cleanState(
          req.user
        )
    });

  }
);

/* =========================================================
   MAILBOX
========================================================= */

app.post(
  "/api/mail/claim",
  requireLogin,
  (req, res) => {

    const mailId =
      String(
        req.body.mailId ||
        ""
      );

    const index =
      req.user.mailbox.findIndex(
        m =>
          String(m.id) ===
          mailId
      );

    if (index < 0) {

      return res
        .status(404)
        .json({
          ok: false,
          error:
            "Không tìm thấy thư"
        });

    }

    const mail =
      req.user.mailbox[
        index
      ];

    if (mail.coins) {

      req.user.coins +=
        Number(
          mail.coins
        );

    }

    if (mail.gems) {

      req.user.gems +=
        Number(
          mail.gems
        );

    }

    if (mail.tickets) {

      req.user.tickets +=
        Number(
          mail.tickets
        );

    }

    if (mail.cardId) {

      req.user.owned.push(
        mail.cardId
      );

    }

    if (mail.pack) {

      ensureUserShape(
        req.user
      );

      req.user.packCounts[
        mail.pack
      ] =
        Number(
          req.user.packCounts[
            mail.pack
          ] || 0
        ) +
        Number(
          mail.packAmount ||
          1
        );

    }

    req.user.mailbox.splice(
      index,
      1
    );

    saveDb();

    res.json({
      ok: true,
      user:
        cleanState(
          req.user
        )
    });

  }
);

/* =========================================================
   MARKET
========================================================= */

app.get(
  "/api/market",
  (req, res) => {

    res.json({
      ok: true,
      prices:
        db.market
    });

  }
);

function marketPriceFor(
  card
) {

  return Math.max(
    1000,

    Number(
      db.market[
        card.name
      ] ||
      Number(
        card.rating || 70
      ) * 10000
    )
  );

}

app.post(
  "/api/market/buy",
  requireLogin,
  (req, res) => {

    const cardId =
      String(
        req.body.cardId ||
        ""
      );

    const card =
      db.cards.find(
        c =>
          c.id === cardId
      );

    if (!card) {

      return res
        .status(404)
        .json({
          ok: false,
          error:
            "Không tìm thấy thẻ"
        });

    }

    const price =
      marketPriceFor(
        card
      );

    if (
      req.user.coins <
      price
    ) {

      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Không đủ Coins"
        });

    }

    req.user.coins -=
      price;

    req.user.owned.push(
      card.id
    );

    saveDb();

    res.json({
      ok: true,
      user:
        cleanState(
          req.user
        ),
      card,
      price
    });

  }
);

app.post(
  "/api/cards/sell",
  requireLogin,
  (req, res) => {

    const cardId =
      String(
        req.body.cardId ||
        ""
      );

    const index =
      req.user.owned.findIndex(
        id =>
          String(id) ===
          cardId
      );

    if (index < 0) {

      return res
        .status(404)
        .json({
          ok: false,
          error:
            "Bạn không sở hữu thẻ này"
        });

    }

    const card =
      db.cards.find(
        c =>
          c.id === cardId
      );

    if (!card) {

      return res
        .status(404)
        .json({
          ok: false,
          error:
            "Không tìm thấy thẻ"
        });

    }

    req.user.owned.splice(
      index,
      1
    );

    const gain =
      Math.floor(
        marketPriceFor(
          card
        ) * 2
      );

    req.user.coins +=
      gain;

    saveDb();

    res.json({
      ok: true,
      user:
        cleanState(
          req.user
        ),
      gain
    });

  }
);

/* =========================================================
   ADMIN GRANT
========================================================= */

app.post(
  "/api/admin/grant",
  requireAdmin,
  (req, res) => {

    const playerId =
      String(
        req.body.playerId ||
        ""
      );

    const target =
      db.users.find(
        u =>
          u.playerId ===
          playerId
      );

    if (!target) {

      return res
        .status(404)
        .json({
          ok: false,
          error:
            "Không tìm thấy người chơi"
        });

    }

    const coins =
      Number(
        req.body.coins ||
        0
      );

    const gems =
      Number(
        req.body.gems ||
        0
      );

    const tickets =
      Number(
        req.body.tickets ||
        0
      );

    const pack =
      req.body.pack
        ? String(
            req.body.pack
          )
        : "";

    const packAmount =
      Math.max(
        1,
        Math.floor(
          Number(
            req.body.packAmount ||
            1
          )
        )
      );

    target.coins =
      Math.max(
        0,
        Number(
          target.coins || 0
        ) + coins
      );

    target.gems =
      Math.max(
        0,
        Number(
          target.gems || 0
        ) + gems
      );

    target.tickets =
      Math.max(
        0,
        Number(
          target.tickets || 0
        ) + tickets
      );

    if (pack) {

      if (
        !Object.prototype.hasOwnProperty.call(
          {
            bronze: 1,
            silver: 1,
            gold: 1,
            premium: 1
          },
          pack
        )
      ) {

        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Loại Pack không hợp lệ"
          });

      }

      ensureUserShape(
        target
      );

      target.mailbox.unshift(
        {
          id:
            makeId(),

          type:
            "pack",

          pack,

          packAmount,

          title:
            "🎁 Quà từ Admin",

          text:
            `Admin đã gửi ${packAmount} ${pack} Pack. Vào Hộp thư để nhận.`,

          createdAt:
            new Date()
              .toISOString()
        }
      );

    }

    saveDb();

    res.json({
      ok: true,
      user:
        cleanState(
          target
        )
    });

  }
);

/* =========================================================
   ADMIN MARKET PRICE
========================================================= */

app.post(
  "/api/admin/price",
  requireAdmin,
  (req, res) => {

    const item =
      String(
        req.body.item ||
        ""
      ).trim();

    const price =
      Math.max(
        0,
        Math.floor(
          Number(
            req.body.price ||
            0
          )
        )
      );

    if (!item) {

      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Thiếu tên item"
        });

    }

    db.market[
      item
    ] =
      price;

    saveDb();

    res.json({
      ok: true,
      prices:
        db.market
    });

  }
);

/* =========================================================
   ADMIN USERS
========================================================= */

app.get(
  "/api/admin/users",
  requireAdmin,
  (req, res) => {

    res.json({

      ok: true,

      users:
        db.users.map(
          u => ({
            playerId:
              u.playerId,

            username:
              u.username,

            nickname:
              u.nickname,

            coins:
              Number(
                u.coins || 0
              ),

            gems:
              Number(
                u.gems || 0
              ),

            tickets:
              Number(
                u.tickets || 0
              ),

            level:
              Number(
                u.level || 1
              ),

            cards:
              Array.isArray(
                u.owned
              )
                ? u.owned.length
                : 0,

            mailbox:
              Array.isArray(
                u.mailbox
              )
                ? u.mailbox.length
                : 0,

            isAdmin:
              !!u.isAdmin
          })
        ),

      prices:
        db.market

    });

  }
);

/* =========================================================
   DEFAULT ADMIN
========================================================= */

let admin =
  db.users.find(
    u =>
      String(
        u.username
      ).toLowerCase() ===
      String(
        ADMIN_USER
      ).toLowerCase()
  );

if (!admin) {

  admin = {

    id:
      makeId(),

    username:
      ADMIN_USER,

    passwordHash:
      hashPassword(
        ADMIN_PASS
      ),

    nickname:
      "ADMIN",

    playerId:
      makePlayerId(),

    avatar:
      "👑",

    title:
      "ADMIN",

    coins:
      999999999,

    gems:
      999999,

    tickets:
      99999,

    level:
      100,

    xp:
      0,

    joinedAt:
      new Date()
        .toISOString(),

    owned: [],

    squad: [],

    formation:
      "4-3-3",

    packCounts: {
      bronze: 999,
      silver: 999,
      gold: 999,
      premium: 999
    },

    mailbox: [],

    friends: [],

    friendRequests: [],

    isAdmin:
      true
  };

  db.users.push(
    admin
  );

} else {

  admin.username =
    ADMIN_USER;

  admin.passwordHash =
    hashPassword(
      ADMIN_PASS
    );

  admin.isAdmin =
    true;

  admin.nickname =
    "ADMIN";

  admin.title =
    "ADMIN";

  ensureUserShape(
    admin
  );

}

saveDb();

/* =========================================================
   START
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Football Legends server running on port ${PORT}`
    );

    console.log(
      `Players: ${Math.floor(
        db.cards.length / 5
      )}`
    );

    console.log(
      `Cards: ${db.cards.length}`
    );

  }
);
