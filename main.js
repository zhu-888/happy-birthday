// 生日动画的网页版：图片和数据由 tools/export_web.py 从桌面版导出，这里用 Canvas 把同样的动画重放一遍。
(() => {
"use strict";
const TAU = Math.PI * 2;
// 排版有两套：横屏（wide）和竖屏（tall），各有自己的数据和图片。下面这些是当前用的那一套，由 use() 换上。
let D, W, H, u, cu, T, TILT, SP, IM, SETS, BG, GOLD, SK, NPTS, CODE_LH;  // SP 每项：[文件, x, y, 宽, 高, 是否加色, 中档透明度, 暗档透明度, 放大倍数]
const $ = id => document.getElementById(id);
const wrap = $("wrap"), canvas = $("stage"), ctx = canvas.getContext("2d", { alpha: false });
const query = new URLSearchParams(location.search);
function use(pack) {
  D = pack.data; IM = pack.images;
  W = D.W; H = D.H; u = D.u; cu = D.cu; T = D.T; TILT = D.tilt; SP = D.sprites; SETS = D.sets;
  BG = `rgb(${D.bg})`; GOLD = `rgb(${D.gold})`;
  SK = D.sketch; NPTS = SK.pts.length / 2; CODE_LH = Math.floor(21 * u);
}

// ---------- 小工具 ----------
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = p => p * p * (3 - 2 * p);
const outCubic = p => 1 - (1 - p) ** 3;
const outBack = (p, s = 1.9) => { p -= 1; return p * p * ((s + 1) * p + s) + 1; };
function outBounce(p) {
  const n = 7.5625, d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) { p -= 1.5 / d; return n * p * p + 0.75; }
  if (p < 2.5 / d) { p -= 2.25 / d; return n * p * p + 0.9375; }
  p -= 2.625 / d; return n * p * p + 0.984375;
}
const rnd = (a, b) => a + Math.random() * (b - a);
const irand = n => Math.floor(Math.random() * n);
const pickOne = list => list[irand(list.length)];

// ---------- 画图 ----------
let K = 1;  // 画布像素 / 舞台像素
let curA = 1, curAdd = 0;
const setA = a => { if (a !== curA) { ctx.globalAlpha = a; curA = a; } };
const setAdd = on => { if (on !== curAdd) { ctx.globalCompositeOperation = on ? "lighter" : "source-over"; curAdd = on; } };
const base = () => ctx.setTransform(K, 0, 0, K, 0, 0);

function blitS(i, x, y, w, h, a = 1) {  // 左上角放在 (x, y)，画成 w×h
  if (a <= 0 || w <= 0 || h <= 0) return;
  const s = SP[i];
  setAdd(s[5]); setA(a);
  ctx.drawImage(IM[s[0]], s[1], s[2], s[3], s[4], x, y, w, h);
}
const blit = (i, x, y, a = 1) => blitS(i, x, y, SP[i][3] * SP[i][8], SP[i][4] * SP[i][8], a);
function mid(i, x, y, a = 1) {  // 中心放在 (x, y)
  const w = SP[i][3] * SP[i][8], h = SP[i][4] * SP[i][8];
  blitS(i, x - w / 2, y - h / 2, w, h, a);
}
const glowAt = (i, x, y, k) => mid(i, x, y, Math.min(1, k));
function dot(i, x, y, lv) {  // 粒子：中心放在 (x, y)，lv 是亮(0)、中(1)、暗(2)三档
  const s = SP[i];
  setAdd(s[5]); setA(lv ? s[5 + lv] : 1);
  ctx.drawImage(IM[s[0]], s[1], s[2], s[3], s[4], x - s[3] / 2, y - s[4] / 2, s[3], s[4]);
}
function tdraw(i, x, y, a = 1, sx = 1, sy = sx, deg = 0, ax = null, ay = null) {
  // 把图上的 (ax, ay) 这一点放在 (x, y)，绕它缩放并逆时针转 deg 度；不给 ax、ay 就是图的中心
  if (a <= 0) return;
  const s = SP[i], w = s[3] * s[8], h = s[4] * s[8], r = -deg * Math.PI / 180, c = Math.cos(r), n = Math.sin(r);
  setAdd(s[5]); setA(a);
  ctx.setTransform(K * c * sx, K * n * sx, -K * n * sy, K * c * sy, K * x, K * y);
  ctx.drawImage(IM[s[0]], s[1], s[2], s[3], s[4], -(ax === null ? w / 2 : ax), -(ay === null ? h / 2 : ay), w, h);
  base();
}
function layer(w, h) {  // 和主画布同样清晰度的离屏画布
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * K)); c.height = Math.max(1, Math.round(h * K));
  const g = c.getContext("2d");
  g.scale(K, K);
  return [c, g];
}
function pick(stars, dots, sizes, warm = false, dabs = 0) {  // 按比例随机挑一种粒子小图
  const r = Math.random(), si = pickOne(sizes);
  if (r < stars) return pickOne(SETS.stars[si]);
  const ci = warm && Math.random() < 0.8 ? pickOne(D.warm) : irand(8);
  if (r < stars + dabs) return SETS.dabs[si][ci * 2 + irand(2)];
  return r < stars + dabs + dots ? SETS.dots[si][ci] : SETS.specks[Math.min(si, 2)][ci];
}

// ---------- 预先画好的几层 ----------
let skyC, codeC, skC, skG, textStill = null;

function buildLayers() {
  let g;
  // 夜空：底色 + 星河的光雾 + 几千颗细碎的星点
  [skyC, g] = layer(W, H);
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  const hz = SP[D.haze];
  g.drawImage(IM[hz[0]], hz[1], hz[2], hz[3], hz[4], 0, 0, W, H);
  [[0.8, "255,255,255", 170], [1.1, "200,220,255", 200], [1.4, "255,240,210", 220], [1.0, "255,190,230", 190],
   [1.8, "255,255,255", 235]].forEach(([r, col, alpha], kind) => {
    g.fillStyle = `rgba(${col},${alpha / 255})`;
    g.beginPath();
    for (let i = 0; i < D.skyDots.length; i += 3) {
      if (D.skyDots[i + 2] !== kind) continue;
      g.moveTo(D.skyDots[i] + r * u, D.skyDots[i + 1]);
      g.arc(D.skyDots[i], D.skyDots[i + 1], r * u, 0, TAU);
    }
    g.fill();
  });
  // 背景里滚动的代码：带语法配色，右侧渐隐
  [codeC, g] = layer(D.codeW, CODE_LH * D.code.length);
  g.font = `${13 * u}px Menlo, Monaco, Consolas, "Courier New", monospace`;
  g.textBaseline = "middle";
  D.code.forEach((line, i) => {
    let x = 0;
    for (const [text, ci] of line) {
      g.fillStyle = `rgb(${D.codeCols[ci]})`;
      g.fillText(text, x, i * CODE_LH + CODE_LH / 2);
      x += g.measureText(text).width;
    }
  });
  const fade = g.createLinearGradient(0, 0, D.codeW, 0);
  fade.addColorStop(0, "rgba(0,0,0,0.8)"); fade.addColorStop(0.71, "rgba(0,0,0,0.8)"); fade.addColorStop(1, "rgba(0,0,0,0)");
  g.globalCompositeOperation = "destination-in";
  g.fillStyle = fade; g.fillRect(0, 0, D.codeW, CODE_LH * D.code.length);
  // 线稿和拼好的字跟着重画
  [skC, skG] = layer(SK.size[0], SK.size[1]);
  skG.fillStyle = GOLD;
  skDone = 0; textStill = null;
}

// ---------- 状态 ----------
let t = 0, sparks = [], tp = [], fw = [], rockets = [], pops = [], flashes = [];
let stage = -1, nextRocket = 0, letterOpen = null, letterShut = null, envSince = Infinity, skDone = 0;
let blowAt = null, popped = false, letterPop = false;  // 蜡烛被吹灭的时刻；信有没有自己弹出来过；这次打开的信是不是从烛芯弹出来的

function reset() {
  t = 0; sparks = []; tp = []; fw = []; rockets = []; pops = []; flashes = [];
  stage = -1; nextRocket = 0; letterOpen = letterShut = null;
  envSince = Infinity;  // 小信封要等信弹出来看完、收起之后才摆到蛋糕前面
  blowAt = null; popped = letterPop = false;
  skDone = 0; textStill = null;
  skG.clearRect(0, 0, SK.size[0], SK.size[1]);
}

function burst(x, y, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), v = speed * rnd(0.2, 1);
    sparks.push([x, y, Math.cos(a) * v, Math.sin(a) * v - speed * 0.3, 0, rnd(0.6, 1.3), pick(0.45, 0.35, [0, 0, 1])]);
  }
}

function matchPos() {  // 点火的那颗火星：从罩子右上方沿一道弧线落到烛芯
  const p = clamp01((t - T.flame + T.match) / T.match), e = smooth(p);
  return [D.fx + 300 * cu * (1 - e), D.fy - 8 * cu - 190 * cu * (1 - e) - 60 * cu * Math.sin(Math.PI * p)];
}

function blow() {  // 把蜡烛吹灭（提示出现之后才算数）
  if (blowAt !== null || t < T.letter) return;
  blowAt = t;
  for (let i = 0; i < 16; i++)  // 火星被吹得往一边飞
    sparks.push([D.fx, D.fy + 2 * cu, rnd(60, 280) * u, rnd(-130, 30) * u, 0, rnd(0.3, 0.7), SETS.specks[pickOne([1, 2])][pickOne(D.warm)]]);
}

function click(x, y) {  // 点信封：打开信，展开后再点一下收起。等着吹蜡烛时点蜡烛或提示：吹灭。点别处：撒一把星星，冒出一条祝福语
  const inside = ([rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
  if (letterOpen !== null) {
    if (letterShut === null && t - letterOpen > T.letterReady) letterShut = t;
  } else if (t > envSince && inside(D.env.rect)) {
    letterOpen = t; letterPop = false;
    burst(x, y, 30, 380 * u);
  } else if (blowAt === null && t >= T.letter && (inside(D.blow.rect) || inside(D.blow.tipRect))) {
    blow();
  } else {
    burst(x, y, 46, 420 * u);
    pops.push([pickOne(D.pops), x, y, t]);
  }
}

// ---------- 每帧更新 ----------
function update(dt) {
  const t0 = t;
  t += dt;
  const crossed = at => t0 < at && at <= t;
  for (let i = 0; i < 3; i++) if (crossed(T.count + i * T.countStep)) burst(W / 2, D.countY - H * 0.04, 30, 460 * u);
  D.hosts.forEach(([, x], i) => { if (crossed(T.host + 0.76 + 0.3 * i)) burst(x, D.hostFloor - H * 0.02, 22, 380 * u); });
  if (crossed(T.flame)) burst(D.fx, D.fy, 60, 400 * u);
  if (t > T.flame - T.match && t <= T.flame) {  // 飞向烛芯的火星一路掉火花
    const [x, y] = matchPos();
    for (let i = 0; i < 4; i++)
      sparks.push([x, y, rnd(-80, 80) * u, rnd(-60, 100) * u, 0, rnd(0.3, 0.8), SETS.specks[pickOne([1, 2, 2])][pickOne(D.warm)]]);
  }

  if (t >= T.sketch && skDone < NPTS) {  // 线稿一笔一笔画出来
    const n = Math.floor(NPTS * clamp01((t - T.sketch) / T.sketchDraw)), r = 1.8 * u;
    skG.beginPath();
    for (let i = skDone; i < n; i++) {
      skG.moveTo(SK.pts[i * 2] + r, SK.pts[i * 2 + 1]);
      skG.arc(SK.pts[i * 2], SK.pts[i * 2 + 1], r, 0, TAU);
    }
    skG.fill();
    skDone = n;
  }
  if (t > T.sketch + 1 && t < T.galaxy - 0.6 && Math.random() < dt * 16) {  // 画好的线稿上不时掉下几点金粉
    const j = irand(Math.max(1, skDone));
    sparks.push([SK.pos[0] + SK.pts[j * 2], SK.pos[1] + SK.pts[j * 2 + 1], rnd(-12, 12) * u, rnd(-30, 10) * u, 0,
                 rnd(0.6, 1.2), SETS.specks[irand(2)][pickOne([2, 7, 0])]]);
  }

  // 烟花：开头一连几发，之后隔一阵来一发；升空时拖着火星，到顶炸成一圈
  const gold = D.fire.length - 1;
  if (t >= T.firework) {
    nextRocket -= dt;
    if (nextRocket <= 0) {
      nextRocket = t < T.firework + 3 ? 0.5 : rnd(1.2, 2.4);
      rockets.push([rnd(0.06, 0.94) * W, rnd(0.1, D.fwLow) * H, 0, irand(gold)]);
    }
  }
  for (const r of rockets) {
    r[2] += dt / 0.8;
    fw.push([r[0], H + (r[1] - H) * outCubic(Math.min(1, r[2])), rnd(-14, 14) * u, rnd(10, 50) * u, 0.3, 0.6, gold, []]);
    if (r[2] >= 1) {
      flashes.push([r[0], r[1], t]);
      for (let i = 0; i < 150; i++) {
        const a = rnd(0, TAU), z = rnd(-1, 1), v = 440 * u * (0.25 + 0.75 * Math.sqrt(1 - z * z)) * rnd(0.92, 1.05);
        fw.push([r[0], r[1], Math.cos(a) * v, Math.sin(a) * v, 0, rnd(1.3, 2.0), Math.random() < 0.8 ? r[3] : gold, []]);
      }
    }
  }
  rockets = rockets.filter(r => r[2] < 1);
  let k = Math.exp(-1.9 * dt), g = 120 * u * dt;
  for (const s of fw) {
    s[7].unshift(s[0], s[1]);  // 记下前几帧的位置，画成拖尾
    if (s[7].length > 6) s[7].length = 6;
    s[2] *= k; s[3] = s[3] * k + g;
    s[0] += s[2] * dt; s[1] += s[3] * dt; s[4] += dt;
  }
  fw = fw.filter(s => s[4] < s[5]);

  if (t >= T.finale) {  // 粒子拼字
    const now = Math.min(D.texts.length - 1, Math.floor((t - T.finale) / T.textHold));
    if (now !== stage) {
      stage = now;
      const pts = D.texts[stage];
      for (let i = 0; i < pts.length / 3; i++) {
        const tx = pts[i * 3], ty = pts[i * 3 + 1], spr = D.textSpr[Math.random() > 0.1 ? pts[i * 3 + 2] : 4][irand(2)];
        const a = rnd(0, TAU), v = rnd(60, 520) * u;
        if (stage === 0) {  // 从烛火里涌出来
          tp.push([D.fx, D.fy, Math.cos(a) * v, Math.sin(a) * v - 200 * u, tx, ty, spr, rnd(2, 7), rnd(0, TAU), T.finale + rnd(0, 1.3)]);
        } else {  // 换下一组字：给一脚再飞向新落点
          const p = tp[i];
          p[2] += Math.cos(a) * v; p[3] += Math.sin(a) * v;
          p[4] = tx; p[5] = ty; p[6] = spr;
        }
      }
    }
    if (t < T.finale + stage * T.textHold + 3.4) {  // 到位以后就不用再算了
      const pull = 34 * dt, damp = Math.exp(-8.5 * dt);
      for (const p of tp) {
        if (t < p[9]) continue;
        p[2] = (p[2] + (p[4] - p[0]) * pull) * damp;
        p[3] = (p[3] + (p[5] - p[1]) * pull) * damp;
        p[0] += p[2] * dt; p[1] += p[3] * dt;
      }
    }
  }

  k = Math.exp(-1.6 * dt); g = 300 * u * dt;
  for (const s of sparks) {
    s[2] *= k; s[3] = s[3] * k + g;
    s[0] += s[2] * dt; s[1] += s[3] * dt; s[4] += dt;
  }
  sparks = sparks.filter(s => s[4] < s[5]);
  pops = pops.filter(p => t - p[3] < 2.6);
  flashes = flashes.filter(p => t - p[2] < 0.3);
  if (blowAt === null && t >= T.letter + D.blowWait) blow();  // 等了很久没人吹，自己灭
  if (blowAt !== null && !popped && t >= blowAt + D.letterAfter && letterOpen === null) {
    popped = letterPop = true;  // 蜡烛灭了：信封从烛芯那里弹出来，自己打开
    letterOpen = t;
  }
  if (letterShut !== null && t - letterShut > 0.6) {  // 信收好了，小信封回到蛋糕前面
    letterOpen = letterShut = null;
    envSince = t;
  }
}

// ---------- 绘制 ----------
function skySlice(x, w) {
  x = Math.max(0, x); w = Math.min(w, W - x);
  if (w > 0) ctx.drawImage(skyC, x * K, 0, w * K, skyC.height, x, 0, w, H);
}

function draw() {
  base();
  setAdd(0); setA(1);
  const sweep = (t - T.galaxy) / T.sweep;
  if (sweep >= 1.15) {
    ctx.drawImage(skyC, 0, 0, skyC.width, skyC.height, 0, 0, W, H);
  } else {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    if (sweep > 0) {  // 夜空从左往右铺开；最前沿分六条越来越淡，不留硬边
      const front = Math.floor(W * sweep), strip = Math.floor(W * 0.025);
      skySlice(0, Math.max(0, front - strip * 6));
      for (let i = 0; i < 6; i++) { setA(1 - (i + 1) / 7); skySlice(front - strip * (6 - i), strip); }
    }
  }
  drawBackdrop();
  if (t > T.stars) {  // 满天的星星一颗颗亮起来
    for (const [x, y, spr, sp, ph, born] of D.starfield) {
      if (t < born) continue;
      const tw = Math.sin(t * sp + ph);
      dot(spr, x, y, t < born + 0.6 ? 2 : tw > 0.2 ? 0 : tw > -0.5 ? 1 : 2);
    }
  }
  for (const [x, y, born] of flashes) glowAt(D.fwFlash, x, y, 1 - (t - born) / 0.3);  // 烟花炸开那一下的闪光
  for (const s of fw) {  // 烟花画在蛋糕后面
    const lv = Math.floor((1 - s[4] / s[5]) * 5.99);
    fwDot(s[6], s[0], s[1], lv);
    for (let j = 0; j * 2 < s[7].length && lv - 1 - j >= 0; j++) fwDot(s[6], s[7][j * 2], s[7][j * 2 + 1], lv - 1 - j);
  }

  if (D.hosts.length && t >= T.host && t < T.count) drawHosts();
  if (t >= T.count && t < T.count + 3 * T.countStep) drawCountdown();
  if (t >= T.balloon && t < T.balloon + 6) {
    for (const [i, x, y0, v, ph] of D.balloons) {  // 八款气球各有三种大小；一边往上飘一边左右晃，往哪边晃就往哪边歪
      const spr = D.balloonImg[i % 8], sc = [0.8, 1, 1.25][i >> 3], h = SP[spr][4] * sc;
      const y = y0 - v * (t - T.balloon);
      if (y > -h && y < H) tdraw(spr, x + Math.sin(t * 1.4 + ph) * 12 * u, y + h / 2, 1, sc, sc, -5 * Math.cos(t * 1.4 + ph));
    }
  }
  if (t >= T.sketch && t < T.galaxy + 0.7) drawSketch();
  const around = t > T.galaxy - 0.6 ? drawGalaxy() : [];
  if (t > T.cake) drawCake();
  for (const p of around) dot(p[0], p[1], p[2], p[3]);

  if (tp.length) {
    const [glow, gx, gy] = D.textGlow[stage];
    glowAt(glow, gx, gy, clamp01((t - T.finale - stage * T.textHold - 0.9) / 0.8));
    if (stage === D.texts.length - 1 && t > T.finale + stage * T.textHold + 3.6) {
      // 最后一组字到位后画成一张图，之后每帧只挑八分之一的粒子点亮
      const [bx, by, bw, bh] = D.textBox;
      if (!textStill) {
        let g;
        [textStill, g] = layer(bw, bh);
        for (const p of tp) {
          const s = SP[p[6]];
          g.globalAlpha = s[6];
          g.drawImage(IM[s[0]], s[1], s[2], s[3], s[4], p[0] - bx - s[3] / 2, p[1] - by - s[4] / 2, s[3], s[4]);
        }
      }
      setAdd(0); setA(1);
      ctx.drawImage(textStill, 0, 0, textStill.width, textStill.height, bx, by, bw, bh);
      for (let i = Math.floor(t * 9) % 8; i < tp.length; i += 8) dot(tp[i][6], tp[i][0], tp[i][1], 0);
    } else {
      for (const p of tp) {
        if (t < p[9]) continue;
        const tw = Math.sin(t * p[7] + p[8]);
        dot(p[6], p[0], p[1], tw > 0 ? 0 : tw > -0.7 ? 1 : 2);
      }
    }
  }
  if (t > T.wishes) drawFriends();
  if (t > envSince && letterOpen === null) drawEnvelope();
  if (t > T.letter && (blowAt === null || t < blowAt + 0.3)) {  // 吹蜡烛的提示：淡入，轻轻上下浮，吹灭后马上淡出
    const tip = D.blow.tips[!canListen() ? 2 : t - T.letter > 9 ? 1 : 0];  // 听不了麦克风就让人点蜡烛；吹了一阵没灭也提醒可以点
    mid(tip, D.blow.pos[0], D.blow.pos[1] + Math.sin(t * 3.1) * 3 * u, clamp01((t - T.letter) / 0.6) * (blowAt === null ? 1 : 1 - (t - blowAt) / 0.3));
  }
  for (const [spr, x, y, born] of pops) {  // 点出来的祝福语往上飘着淡出
    const age = t - born;
    mid(spr, x, y - 30 * u - age * 34 * u, Math.min(1, age / 0.25, (2.6 - age) / 0.8));
  }
  for (const s of sparks) {
    const life = 1 - s[4] / s[5];
    dot(s[6], s[0], s[1], life > 0.55 ? 0 : life > 0.25 ? 1 : 2);
  }
  if (letterOpen !== null) drawLetter();
  if (t < 0.6) { setAdd(0); setA(1 - t / 0.6); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
}

function fwDot(ci, x, y, lv) {  // 烟花的光点：越暗的档越小
  const k = (lv + 1) / 6, s = SP[D.fwImg[ci]], size = s[3] * (3 + 7 * k) / 10;
  setAdd(1); setA(k);
  ctx.drawImage(IM[s[0]], s[1], s[2], s[3], s[4], x - size / 2, y - size / 2, size, size);
}

function drawBackdrop() {
  const dim = Math.ceil(clamp01((T.galaxy - t) / 1.2) * 5) / 5;  // 星河出现前，代码和暗色大星星分五档淡出
  if (dim > 0) {
    const top = Math.round(t * 24 * u * K), rows = Math.min(canvas.height, codeC.height - top);
    setAdd(0); setA(dim);
    if (rows > 0) ctx.drawImage(codeC, 0, top, codeC.width, rows, 16 * u, 0, D.codeW, rows / K);
    for (const [x, y, spr, ph] of D.bgStars) blit(spr, x, y + Math.sin(t * 0.5 + ph) * 8 * u, dim);
  }
  for (const [x, y, i, v, ph] of D.dust) blit(D.dustImg[i], x + Math.sin(t * 0.3 + ph) * 12 * u, (y + v * t) % (H + 20) - 10);
}

function drawFlame(img, glow, x, y, ph, grow) {
  if (grow <= 0.01) return;
  const fl = 1 + 0.10 * Math.sin(t * 11.3 + ph) + 0.05 * Math.sin(t * 23.7 + ph * 2);
  const ang = 4 * Math.sin(t * 5.3 + ph) + 2.5 * Math.sin(t * 12.1 + ph), rad = ang * Math.PI / 180;
  const d = SP[img][4] * grow * fl / 2;
  if (grow > 0.5) glowAt(glow, x, y - d * 0.6, 1);
  tdraw(img, x - d * Math.sin(rad), y - d * Math.cos(rad), 1, grow * (2 - fl), grow * fl, ang);
}

function drawBlown(age) {
  // 蜡烛被吹灭：火苗被吹得歪向一边、越缩越小；灭了以后烛芯还红一小会儿，一缕烟弯弯曲曲地升上去、散开
  const B = D.blow;
  if (age < D.blowOut) drawCandleFlame(1 - smooth(age / D.blowOut), age / D.blowOut);
  glowAt(B.ember, D.fx + 1.5 * cu, D.fy + 3 * cu, clamp01(age / 0.2) * clamp01(1 - (age - 0.3) / 1.6));
  for (let i = 0; i < 22; i++) {  // 一团团烟接连冒出来，连成一缕：往上升、左右弯、往旁边飘、变大、变淡
    const a = age - 0.1 - i * 0.12;
    if (a <= 0 || a >= 2.4) continue;
    const p = a / 2.4, size = B.smokeMax * (0.2 + 0.1 * Math.min(8, Math.floor(p * 9)));
    blitS(B.smoke, D.fx + (Math.sin(a * 2.6 + i * 0.5) * 13 + 22 * p) * p * cu - size / 2,
          D.fy + 2 * cu - 190 * cu * (1 - (1 - p) ** 1.8) - size / 2, size, size, 150 / 255 * Math.min(1, a / 0.2) * (1 - p) ** 1.3);
  }
}

function drawCandleFlame(grow, push = 0) {
  // 蛋糕上的火苗：整张图先忽长忽短地拉伸，再切成一条条横条，越靠上的横条左右摆得越多，还有一道波从下往上传，
  // 看起来就是软的、会扭动的火，不是一张硬片在摇
  if (grow <= 0.01) return;
  const s = SP[D.flame], fl = 1 + 0.07 * Math.sin(t * 9.7) + 0.04 * Math.sin(t * 21.3 + 1.0);
  const w = s[3] * grow * (2 - fl), h = s[4] * grow * fl;
  const lean = 3.2 * Math.sin(t * 2.3 + 0.7) + 1.6 * Math.sin(t * 5.9) + 34 * push;  // 火尖往一边偏多少；push 是被吹的力度
  if (push > 0) glowAt(D.flameGlow, D.fx, D.fy - h * 0.26, (1 - push) ** 2);
  else if (grow > 0.5) glowAt(D.flameGlow, D.fx, D.fy - h * 0.26, 1);
  setAdd(0); setA(1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);  // 直接按画布像素画，横条的上下边落在整数行上，条与条之间才没有缝
  const n = D.flameStrips, left = (D.fx - w / 2) * K, topPx = Math.round((D.fy + D.flameDrop * cu - h) * K), rows = Math.max(n, Math.round(h * K));
  for (let i = 0; i < n; i++) {
    const ya = Math.floor(rows * i / n), yb = Math.floor(rows * (i + 1) / n), v = 1 - (i + 0.5) / n;  // v：这一条有多高，0 在烛芯，1 在火尖
    const off = (lean * v ** 1.7 + 1.3 * Math.sin(t * 8.5 - v * 5.5) * v) * cu * grow * K;
    ctx.drawImage(IM[s[0]], s[1], s[2] + s[4] * ya / rows, s[3], s[4] * (yb - ya) / rows, left + off, topPx + ya, w * K, yb - ya);
  }
  base();
}

function drawHosts() {
  const a = t - T.host, gone = clamp01((a - T.hostStay + 0.7) / 0.5), fade = clamp01(a / 0.8) * (1 - gone);
  mid(D.hostGlow, W / 2, D.hostGlowY, fade);
  for (const [x, speed, start, spr, ph] of D.bits)  // 慢慢往上飘的小爱心和星星
    blit(spr, x + Math.sin(t * 1.2 + ph) * 14 * u, H * 1.08 - (start + a * speed / H) % 1 * H * 1.2, Math.min(fade, 215 / 255));
  // 彩旗从上面落下来，退场时收回去
  blit(D.bunting, 0, (outBack(clamp01(a / 0.7), 1.4) - 1) * 110 * u - gone * gone * 130 * u + Math.sin(t * 1.6) * 2 * u);
  const speaking = D.talk.find(line => a - line.start > 0 && a - line.start < line.span);
  const floor = D.hostFloor;
  D.hosts.forEach(([spr, x], i) => {  // 小狮子从上面掉下来弹两下，然后左右摇晃；正在说话的那只一蹦一蹦
    const p = (a - 0.5 - 0.3 * i) / 0.7;
    if (p <= 0) return;
    let y, ang = 0;
    if (p < 1) {
      y = floor - (1 - outBounce(p)) * H * 0.9;
    } else {
      ang = 4 * Math.sin(t * 2.2 + i * 1.3);
      const hop = speaking && speaking.who === i ? Math.abs(Math.sin(t * 7)) * 16 : Math.max(0, Math.sin(t * 3.9 + i * 2.1)) ** 2 * 8;
      y = floor - hop * u;
    }
    y += clamp01((a - T.hostStay + 0.7 - 0.08 * i) / 0.45) ** 2 * H * 0.8;
    tdraw(spr, x, y, 1, 1, 1, ang, SP[spr][3] / 2, SP[spr][4]);  // 绕脚底转，摇晃时脚不动
  });
  if (!speaking) return;
  // 对话框弹出来，字一个个蹦出，停一会儿，再缩回去换下一只说
  const b = a - speaking.start, size = outBack(clamp01(b / 0.35)) * clamp01((speaking.span - 0.1 - b) / 0.3);
  if (size <= 0.02) return;
  const tx = D.hosts[speaking.who][1] + 30 * u, ty = floor - D.hostH - 20 * u + Math.sin(t * 2.1) * 3 * u;
  const [tipX, tipY] = speaking.tip, full = size > 0.999;
  tdraw(speaking.img, tx, ty, 1, size, size, 0, tipX, tipY);  // 以尾巴尖为支点缩放
  speaking.words.forEach(([g, gx, gy], i) => {
    const w = SP[g][3], h = SP[g][4];
    if (!full) {
      if (b >= 1) tdraw(g, tx, ty, 1, size, size, 0, tipX - gx, tipY - gy);  // 收起时带着字一起缩
      return;
    }
    const p = (b - 0.4 - 0.1 * i) / 0.3;
    if (p <= 0) return;
    const yy = gy + Math.sin(t * 4 - i * 0.7) * 2.5 * u, pop = p < 1 ? Math.max(0.05, outBack(p, 2.4)) : 1;
    tdraw(g, tx - tipX + gx + w / 2, ty - tipY + yy + h / 2, 1, pop);
  });
}

function drawCountdown() {
  const i = Math.floor((t - T.count) / T.countStep), a = t - T.count - i * T.countStep;
  const [spr, fx, fy] = D.digits[i], sc = outBack(clamp01(a / 0.3)), fade = clamp01((T.countStep - a) / 0.25);
  const w = SP[spr][3] * sc, h = SP[spr][4] * sc, x = W / 2 - w / 2, y = D.countY - h / 2 + Math.sin(t * 3) * 4 * u;
  blitS(spr, x, y, w, h, fade);
  drawFlame(D.countFlame, D.countGlow, x + fx * sc, y + fy * sc, i * 2.1, sc * fade);
  const slide = 1 - outBack(clamp01(a / 0.45), 1.2);
  D.hosts.forEach(([hs], j) => {  // 每个数字旁边跟着小狮子，从屏幕两侧滑进来
    if (j % 3 !== i) return;
    const hw = SP[hs][3] * 0.86, hh = SP[hs][4] * 0.86, side = j % 2 === 0 ? -1 : 1;
    blitS(hs, W / 2 + side * (D.countSide + slide * W * 0.4) - hw / 2, D.countFloor - hh - Math.max(0, Math.sin(t * 5 + j)) ** 2 * 16 * u, hw, hh, fade);
  });
}

function drawSketch() {
  const alpha = clamp01((T.galaxy + 0.7 - t) / 1.3);
  if (alpha <= 0) return;
  setAdd(0); setA(alpha);
  ctx.drawImage(skC, 0, 0, skC.width, skC.height, SK.pos[0], SK.pos[1], SK.size[0], SK.size[1]);
  for (const [spr, x, y, start, dur] of SK.texts) {  // 文字从左往右写出来
    const p = clamp01((t - T.sketch - start) / dur), s = SP[spr];
    if (p > 0.004) ctx.drawImage(IM[s[0]], s[1], s[2], s[3] * p, s[4], x - s[3] / 2, y - s[4] / 2, s[3] * p, s[4]);
  }
}

function drawGalaxy() {  // 画转到蛋糕后面的那半圈星河，返回转到前面的那半圈，等蛋糕画完再画
  const front = [];
  for (const [x0, y0, x1, y1, spr, sp, ph, go] of D.skDust) {  // 线稿化成的星星沿一道弧线飞进星河，之后留在那里闪
    const e = smooth(clamp01((t - go) / 2.8)), bend = Math.sin(e * Math.PI) * 0.16, tw = Math.sin(t * sp + ph);
    dot(spr, x0 + (x1 - x0) * e - (y1 - y0) * bend, y0 + (y1 - y0) * e + (x1 - x0) * bend,
        t < T.galaxy - 0.2 ? 2 : tw > 0.1 ? 0 : tw > -0.6 ? 1 : 2);
  }
  for (const [phi, r, w, lift, spr, sp, ph, born] of D.galaxy) {
    if (t < born) continue;
    const p = phi + w * t, s = Math.sin(p), tw = Math.sin(t * sp + ph);
    const lv = t < born + 0.5 ? 2 : tw > 0.1 ? 0 : tw > -0.6 ? 1 : 2, x = D.dx + r * Math.cos(p), y = D.gy + r * TILT * s + lift;
    if (s > 0) front.push([spr, x, y, lv]); else dot(spr, x, y, lv);
  }
  return front;
}

function drawCake() {
  const a = t - T.cake, dx = D.dx, dy = D.dy, R = D.R, rot = t * 0.3, sin = Math.sin, cos = Math.cos;
  let ax, ay;
  const arrive = (x, y, delay, x0, y0) => {  // 进场：从星河上的起点飞到自己的位置
    let e = (a - delay) / 2.0;
    if (e >= 1) { ax = x; ay = y; return; }
    e = 1 - (1 - e) ** 3;
    ax = x0 + (x - x0) * e; ay = y0 + (y - y0) * e;
  };
  const level = tw => tw > 0.1 ? 0 : tw > -0.6 ? 1 : 2;

  const front = [];
  for (const [r, th0, w, y, bob, spr, sp, ph, delay, x0, y0] of D.floaters) {  // 罩子里飘浮的，转到后面的先画
    if (a <= delay) continue;
    const th = th0 + w * t, z = r * sin(th);
    arrive(dx + r * cos(th), dy - y - bob * sin(t * 0.9 + ph) + z * TILT, delay, x0, y0);
    const lv = level(sin(t * sp + ph));
    if (z > 0) front.push([spr, ax, ay, lv]); else dot(spr, ax, ay, lv);
  }
  const domed = clamp01((a - 2.6) / 1.6);
  blit(D.cake[0], D.cake[1], D.cake[2], domed < 1 ? clamp01((a - 0.6) / 2.0) : 1);
  if (domed === 1) blit(D.dome[0], D.dome[1], D.dome[2]);

  for (const [th0, y, spr, sp, ph, delay, x0, y0] of D.side) {  // 贴在蛋糕侧面跟着转的
    const z = sin(th0 + rot);
    if (z < 0.06 || a <= delay) continue;
    arrive(dx + R * cos(th0 + rot), dy - y + R * z * TILT, delay, x0, y0);
    dot(spr, ax, ay, z < 0.3 ? 2 : level(sin(t * sp + ph)));
  }
  if (a > 3.4) {  // 侧面的小字，切成竖条贴在圆柱上
    const [spr, sw, n, labelY] = D.label, s = SP[spr];
    setAdd(0); setA(1);
    for (let i = 0; i < n; i++) {
      const off = (n / 2 - i) * sw / R, z = sin(rot + off);
      if (z > 0.25) ctx.drawImage(IM[s[0]], s[1] + i * sw, s[2], sw, s[4], dx + R * cos(rot + off), dy - labelY + R * z * TILT, sw, s[4]);
    }
  }
  const top = dy - D.HC, ahead = [];
  for (const [r, th0, lift, spr, sp, ph, delay, x0, y0] of D.top) {  // 顶面的闪粉：转到蜡烛后面的先画，蜡烛插在中间，转到前面的最后画
    if (a <= delay) continue;
    const z = sin(th0 + rot);
    arrive(dx + r * cos(th0 + rot), top - lift + r * z * TILT, delay, x0, y0);
    if (z > 0) ahead.push([spr, ax, ay, level(sin(t * sp + ph))]); else dot(spr, ax, ay, level(sin(t * sp + ph)));
  }
  blit(D.candle[0], D.candle[1], D.candle[2], clamp01((a - 0.6) / 2.0));
  for (const p of ahead) dot(p[0], p[1], p[2], p[3]);

  if (t > T.flame) {
    if (t < T.flame + 0.3) glowAt(D.flameGlow, D.fx, D.fy, 1);  // 点着的一瞬间多闪一下
    if (blowAt === null) drawCandleFlame(outBack(clamp01((t - T.flame) / 0.4)));
    else drawBlown(t - blowAt);
  } else if (t > T.flame - T.match) {
    const [mx, my] = matchPos();
    glowAt(D.matchGlow, mx, my, 1);
  }
  for (const p of front) dot(p[0], p[1], p[2], p[3]);
  if (domed > 0 && domed < 1) {
    blit(D.dome[0], D.dome[1], D.dome[2], domed);
  } else if (domed === 1) {
    for (const [x, y, spr, sp, ph] of D.outer) {  // 罩子外面和玻璃沿上一闪一闪的
      const tw = sin(t * sp + ph);
      if (tw > -0.5) dot(spr, x, y, tw > 0.4 ? 0 : 1);
    }
  }
}

function drawFriends() {  // 朋友们一排一排（左右各两只）慢慢浮现，各自的对话框跟着浮现；到位后轻轻蹦跳
  D.friends.forEach(([spr, x, y, bubble, ph], i) => {
    const a = t - T.wishes - Math.floor(i / 4) * T.friendGap;
    if (a <= 0) return;
    const w = SP[spr][3], h = SP[spr][4], show = smooth(clamp01(a / 1.6)), say = smooth(clamp01((a - 1.1) / 1.3));
    const hop = Math.abs(Math.sin(t * 2.2 + ph)) * 7 * u * clamp01(a - 1.6);
    blit(spr, x - w / 2, y - h - hop + (1 - show) * 18 * u, show);
    if (say > 0)
      blit(bubble, x - SP[bubble][3] / 2, y - h + 3 * u - hop * 0.5 + Math.sin(t * 1.7 + ph) * 2 * u + (1 - say) * 10 * u - SP[bubble][4], say);
  });
}

function drawEnvelope() {  // 蛋糕前面的小信封：蹦出来，轻轻浮动，隔一会儿晃一晃，旁边一行小字提示可以点开
  const E = D.env, a = t - envSince, x = E.pos[0], y = E.pos[1] + Math.sin(t * 2.3) * 4 * u, wig = a % 3.4;
  glowAt(E.glow, x, y, clamp01(a / 0.6) * (0.65 + 0.35 * Math.sin(t * 3.1)));
  const sc = D.envSmall * (a < 0.5 ? outBack(clamp01(a / 0.5), 2.4) : 1);
  tdraw(E.whole, x, y, 1, sc, sc, -8 + (a >= 0.5 && wig < 0.6 ? Math.sin(wig * 21) * 7 * (0.6 - wig) / 0.6 : 0));
  if (a > 0.7) {  // 提示在横屏时摆在信封下面，竖屏时摆在右边，朝那个方向轻轻晃
    const bob = Math.abs(Math.sin(t * 3.1)) * 5 * u;
    blit(E.tip, x + E.tipOff[0] + E.tipDir[0] * bob, y + E.tipOff[1] + E.tipDir[1] * bob, clamp01((a - 0.7) / 0.5));
  }
}

function drawLetter() {
  // 点开信封后：画面暗下来，信封飞到中间、封盖打开，折着的信纸升出来飞到屏幕中央，上下两折依次展开，文字逐行浮现
  const E = D.env, e = t - letterOpen, away = letterShut !== null ? clamp01((t - letterShut) / 0.6) : 0;
  setAdd(0); setA(175 / 255 * clamp01(e / 0.6) * (1 - away));
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const [x0, y0] = letterPop ? [D.fx, D.fy - 10 * cu] : E.pos, x1 = W / 2, y1 = H * 0.62, tiny = letterPop ? D.popSmall : D.envSmall;
  if (e < 0.6) {  // 信封从蛋糕前面（或者从刚吹灭的烛芯那里）飞到屏幕中间，边飞边变大
    const p = smooth(e / 0.6), sc = tiny + (1 - tiny) * p;
    tdraw(E.whole, x0 + (x1 - x0) * p, y0 + (y1 - y0) * p, 1, sc, sc, -8 * (1 - p));
    return;
  }
  const paper = SP[D.paper], pw = paper[3], ph = paper[4], third = ph / 3, lifted = y1 - 245 * u;  // lifted：信纸升出信封后停的高度
  const fly = smooth(clamp01((e - 2.3) / 0.9)), small = D.packetScale;
  if (fly < 1) {  // 信封还在：里层、打开的封盖、信纸、前面的口袋、合着的封盖，按这个顺序叠
    const ox = x1 - E.anchor[0], oy = y1 - E.anchor[1] + fly * fly * H * 0.7, hinge = oy + E.hinge, q = clamp01((e - 0.6) / 0.6);
    blit(E.back, ox, oy);
    if (q > 0.5) { const hh = SP[E.lidUp][4] * (q * 2 - 1); blitS(E.lidUp, ox, hinge - hh, SP[E.lidUp][3], hh); }
    if (fly === 0) {
      const cy = y1 + (lifted - y1) * smooth(clamp01((e - 1.2) / 1.1));
      blitS(D.packet, x1 - pw * small / 2, cy - third * small / 2, pw * small, third * small);
    }
    blit(E.front, ox, oy);
    if (q <= 0.5) blitS(E.lid, ox, hinge, SP[E.lid][3], SP[E.lid][4] * (1 - q * 2));
  }
  const cx = W / 2, cy = H / 2 + away * away * H;  // 收起时整张信纸往下滑出画面
  if (fly > 0 && fly < 1) {  // 折着的信纸飞到屏幕中央，同时放大
    const sc = small + (1 - small) * fly, px = x1 + (cx - x1) * fly, py = lifted + (cy - lifted) * fly;
    blitS(D.packet, px - pw * sc / 2, py - third * sc / 2, pw * sc, third * sc);
  } else if (fly === 1) {
    const up = smooth(clamp01((e - 3.3) / 0.9)), down = smooth(clamp01((e - 4.0) / 0.9)), left = cx - pw / 2, top = cy - ph / 2;
    if (down === 1) {
      blit(D.paper, left, top);
      D.lines.forEach(([spr, x, y], i) => blit(spr, left + x, top + y, clamp01((e - T.letterReady - 0.32 * i) / 0.7)));
      if (away === 0 && e > T.letterReady + 1) {
        const tip = E.closeTip;
        blit(tip, W / 2 - SP[tip][3] / 2, H - 10 * u - SP[tip][4], 150 / 255 * clamp01(e - T.letterReady - 1));
      }
    } else {  // 中间一折先露着，上面一折往上翻开，下面一折往下翻开
      const panel = (i, y, h, alpha, dark) => {
        if (h < 1) return;
        setAdd(0); setA(alpha);
        ctx.drawImage(IM[paper[0]], paper[1], paper[2] + i * third, pw, third, left, y, pw, h);
        if (dark > 0) { setA(dark); ctx.fillStyle = "#000"; ctx.fillRect(left, y, pw, h); }  // 翻到一半时暗一点
      };
      blit(D.packet, left, top + third);
      panel(1, top + third, third, down, 0);
      panel(0, top + third - third * up, third * up, 1, 0.353 * (1 - up));
      panel(2, top + third * 2, third * down, 1, 0.353 * (1 - down));
    }
  }
}

// ---------- 音乐：用振荡器合成八音盒音色的《生日快乐》 ----------
let audio = null, master = null, musicTimer = 0, muted = query.has("mute");
function startMusic(delay) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  } catch (err) { return; }
  stopMusic();
  master = audio.createGain();
  master.gain.value = muted ? 0 : 0.16;
  master.connect(audio.destination);
  const [G4, A4, B4, C5, D5, E5, F5, G5] = [392.0, 440.0, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99];
  const tune = [[G4, .75], [G4, .25], [A4, 1], [G4, 1], [C5, 1], [B4, 2], [G4, .75], [G4, .25], [A4, 1], [G4, 1], [D5, 1], [C5, 2],
                [G4, .75], [G4, .25], [G5, 1], [E5, 1], [C5, 1], [B4, 1], [A4, 2], [F5, .75], [F5, .25], [E5, 1], [C5, 1], [D5, 1], [C5, 3]];
  const beat = 0.5, loop = tune.reduce((sum, n) => sum + n[1], 0) * beat + 1.2, out = master;
  let next = audio.currentTime + delay;
  const schedule = () => {  // 提前排好接下来两遍，快放完时再续
    while (next < audio.currentTime + loop * 2) {
      let at = next;
      for (const [freq, beats] of tune) {
        for (const [mult, vol] of [[2, 1], [4, 0.3]]) {
          const osc = audio.createOscillator(), env = audio.createGain();
          osc.frequency.value = freq * mult;
          env.gain.setValueAtTime(0, at);
          env.gain.linearRampToValueAtTime(vol, at + 0.004);
          env.gain.exponentialRampToValueAtTime(vol * 0.021, at + 1.1);
          osc.connect(env); env.connect(out);
          osc.start(at); osc.stop(at + 1.12);
        }
        at += beats * beat;
      }
      next += loop;
    }
  };
  schedule();
  musicTimer = setInterval(schedule, 4000);
}
function stopMusic() {
  clearInterval(musicTimer);
  if (master) { master.disconnect(); master = null; }
}

// ---------- 吹蜡烛：用麦克风听有没有人对着屏幕吹气 ----------
// 声音只在这台设备上当场分析响度，不录音、不保存、不上传。不给麦克风权限或者浏览器不支持时，改成点一下蜡烛。
let mic = null, micOff = false;  // mic：正在用的麦克风；micOff：这次打开页面已经确定用不了，不再去要
const canListen = () => !micOff && !!audio && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;

function micStart() {
  if (!canListen()) { micOff = true; return; }
  const mine = mic = { state: "ask", hot: 0, base: null, age: 0 };
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(stream => {
    if (mic !== mine) { stream.getTracks().forEach(track => track.stop()); return; }  // 等权限的工夫已经不用听了
    mine.stream = stream;
    mine.src = audio.createMediaStreamSource(stream);
    mine.an = audio.createAnalyser();
    mine.an.fftSize = 1024; mine.an.smoothingTimeConstant = 0.3; mine.an.minDecibels = -90; mine.an.maxDecibels = -20;
    mine.src.connect(mine.an);  // 只接到分析器，不接到喇叭，不会把声音放出来
    mine.buf = new Uint8Array(mine.an.frequencyBinCount);
    mine.state = "on";
    audio.resume();  // 有的手机一开麦克风会把正在放的音乐停掉
  }).catch(() => { micOff = true; if (mic === mine) mic = null; });
}
function micStop() {
  if (!mic) return;
  if (mic.stream) mic.stream.getTracks().forEach(track => track.stop());
  if (mic.src) mic.src.disconnect();
  mic = null;
}
function blowing(m, buf, hz, dt) {
  // 吹气打在话筒上是一片低沉的呼呼声：三百赫兹以下很响，而且比中高频响得多，还要持续一小会儿。
  // 背景音乐是八音盒音色，都在七百赫兹以上，不会被当成吹气。buf 是各频率的响度（0-255），hz 是每一格多少赫兹。
  const band = (lo, hi) => { let sum = 0, n = 0; for (let i = Math.max(1, Math.round(lo / hz)); i <= Math.round(hi / hz); i++) { sum += buf[i]; n++; } return sum / n; };
  const low = band(50, 320), high = band(700, 3000);
  m.age += dt;
  if (m.base === null) m.base = low;
  const loud = m.age > 0.4 && low > Math.max(135, m.base + 45) && low > high + 18;
  if (!loud) m.base += (low - m.base) * Math.min(1, dt * 1.5);  // 平时的底噪，慢慢跟着变
  m.hot = loud ? m.hot + dt : Math.max(0, m.hot - dt * 2);
  return m.hot > 0.18;
}
function listen(dt) {  // 每帧调一次：等着吹蜡烛的时候打开麦克风听，听到吹气就把蜡烛吹灭；不用听了就关掉麦克风
  if (!(running && blowAt === null && t >= T.letter)) { micStop(); return; }
  if (!mic) { if (!micOff) micStart(); return; }
  if (mic.state !== "on") return;
  mic.an.getByteFrequencyData(mic.buf);
  if (blowing(mic, mic.buf, audio.sampleRate / mic.an.fftSize, dt)) blow();
}

// ---------- 页面：横竖屏、缩放、点击、开始和重播 ----------
let cur = null, cssW = 1, cssH = 1, running = false, last = 0, failed = false;
const speed = parseFloat(query.get("speed")) || 1;
const stats = { frames: 0, total: 0, worst: 0 };
const BUILD = "e739bbde";  // 数据文件的指纹，由导出脚本填：数据一变地址就变，浏览器不会拿缓存里的旧数据配新脚本
const PACKS = { wide: { src: "data.js" }, tall: { src: "data_tall.js" } };
for (const name in PACKS) Object.assign(PACKS[name], { data: null, images: [], state: 0, progress: 0 });  // state：0 没加载，1 加载中，2 好了
const wanted = () => query.get("pack") in PACKS ? query.get("pack") : innerHeight > innerWidth ? "tall" : "wide";  // 竖着拿用竖屏那套

function load(name) {  // 先取这一套的数据，再取它用到的图片；全部到齐后调 fit() 换上
  const pack = PACKS[name];
  if (pack.state) return;
  pack.state = 1;
  const fail = () => { failed = true; showProgress(); };
  const tag = document.createElement("script");
  tag.src = pack.src + "?v=" + BUILD;
  tag.onerror = fail;
  tag.onload = () => {
    pack.data = window.PACKS_DATA[name];
    let loaded = 0;
    pack.data.files.forEach((src, i) => {
      const img = new Image();
      img.onerror = fail;
      img.onload = () => {
        pack.progress = ++loaded / pack.data.files.length;
        if (loaded === pack.data.files.length) { pack.state = 2; fit(); }
        showProgress();
      };
      img.src = src;
      pack.images[i] = img;
    });
  };
  document.head.appendChild(tag);
}
function showProgress() {
  const pack = PACKS[wanted()], go = $("go");
  go.disabled = failed || pack.state !== 2;
  go.textContent = failed ? "加载失败，请刷新重试" : pack.state === 2 ? "点击开始" : `加载中 ${Math.round(pack.progress * 100)}%`;
}

function fit() {  // 按手机横着还是竖着选一套排版，再把舞台按比例缩放到正好放进窗口
  const name = wanted();
  load(name);
  showProgress();
  let changed = false;
  if (PACKS[name].state === 2 && cur !== name) {  // 要用的那套到齐了：换上。没到齐之前先接着用原来那套
    cur = name; changed = true;
    use(PACKS[name]);
    wrap.classList.toggle("tall", name === "tall");
  }
  if (!cur) return;
  cssW = Math.min(innerWidth, innerHeight * W / H); cssH = cssW * H / W;
  wrap.style.width = cssW + "px"; wrap.style.height = cssH + "px";
  wrap.classList.toggle("side", innerWidth - cssW > 12);
  const px = Math.min(W, Math.round(cssW * Math.min(window.devicePixelRatio || 1, parseFloat(query.get("dpr")) || 2.5)));
  if (changed || Math.abs(px - canvas.width) > 16) {
    canvas.width = px; canvas.height = Math.round(px * H / W);
    K = px / W; curA = 1; curAdd = 0;
    buildLayers();
    if (changed) replay(); else { const now = t; t = Math.min(now, T.sketch); update(0); t = now; update(0); }  // 只是清晰度变了：把线稿补画到当前进度
    draw();
    if (changed && query.has("auto") && !running) {  // 调试用：?auto&t=60 直接跳到第 60 秒，不放音乐；?pack=tall 指定用哪套
      start(false);
      const target = parseFloat(query.get("t")) || 0;
      while (t < target) update(1 / 30);
    }
  }
}
function replay() {  // 换了一套排版：粒子的位置都不一样了，从头快速重算到现在的时刻，信开着的话保持开着
  const now = t, ago = at => at === null ? null : now - at, back = d => d === null ? null : t - d;
  const was = { open: ago(letterOpen), shut: ago(letterShut), blow: ago(blowAt), env: now - envSince, popped, letterPop };
  reset();
  const stop = Math.min(now, T.letter);  // 再往后只剩烟花在放，直接跳过去
  while (t < stop) update(1 / 30);
  if (now > t) { t = now; fw = []; rockets = []; sparks = []; flashes = []; }
  letterOpen = back(was.open); letterShut = back(was.shut); blowAt = back(was.blow); envSince = t - was.env;
  popped = was.popped; letterPop = was.letterPop;
}

function toStage(ev) {
  const box = canvas.getBoundingClientRect();
  return [(ev.clientX - box.left) / box.width * W, (ev.clientY - box.top) / box.height * H];
}

function start(withSound) {
  reset();
  running = true; last = performance.now();
  $("start").style.display = "none";
  $("bar").style.display = "flex";
  if (withSound) startMusic(T.music);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;
  const real = (now - last) / 1000;
  last = now;
  update(Math.min(real, 0.05) * speed);
  listen(Math.min(real, 0.05));
  draw();
  stats.frames++; stats.total += real; stats.worst = Math.max(stats.worst, real);
}

fit();
addEventListener("resize", fit);
addEventListener("orientationchange", () => setTimeout(fit, 200));
$("go").addEventListener("click", () => start(true));
$("replay").addEventListener("click", ev => { ev.stopPropagation(); start(true); });
$("mute").addEventListener("click", ev => {
  ev.stopPropagation();
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.16;
  $("mute").textContent = muted ? "开声音" : "静音";
});
canvas.addEventListener("pointerdown", ev => { if (running) click(...toStage(ev)); });
document.addEventListener("visibilitychange", () => {  // 切到后台时动画会自动停，音乐也跟着停
  if (audio) document.hidden ? audio.suspend() : audio.resume();
});
requestAnimationFrame(frame);

// 调试和测试用
window.show = {
  get t() { return t; }, stats, click, reset, blow,
  hear(spectra, hz = 46.875, dt = 1 / 60) {  // 测试用：把一串频谱喂给吹气识别，返回第几帧判定为吹气（没判定返回 -1）
    const m = { hot: 0, base: null, age: 0 };
    for (let i = 0; i < spectra.length; i++) if (blowing(m, spectra[i], hz, dt)) return i;
    return -1;
  },
  seek(to) { if (to < t) reset(); while (t < to) update(1 / 30); draw(); },
  bench(n = 60) {  // 连续画 n 帧，返回每帧平均毫秒数（读一个像素强制把绘制做完）
    const a = performance.now();
    for (let i = 0; i < n; i++) { update(1 / 60); draw(); }
    ctx.getImageData(0, 0, 1, 1);
    return (performance.now() - a) / n;
  },
  state: () => ({ t, pack: cur, size: [W, H], env: D.env.rect, blowAt, popped, letterPop, mic: micOff ? "off" : mic ? mic.state : "idle", sparks: sparks.length, tp: tp.length, fw: fw.length, letterOpen, envSince, stage, skDone, K, px: [canvas.width, canvas.height] }),
};
})();
