const $ = id => document.getElementById(id);

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    alert('ブラウザに保存できませんでした。');
  }
}

let history = load('cafeHistoryV2', []);
let design = load('cafeDesignV2', {
  wall: 'pink', cloth: 'check', plate: 'white'
});

let menus = [];
let selected = {drink: null, sweet: null};
let order = null;
let conversation = [];
let lastReply = '';
let talking = false;

function node(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function button(text, action, cls) {
  const b = node('button', text, cls);
  b.onclick = action;
  return b;
}

function yen(n) {
  return '¥' + Number(n).toLocaleString('ja-JP');
}

function show(page) {
  document.querySelectorAll('.page').forEach(e => {
    e.classList.toggle('active', e.id === page);
  });

  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('current', b.dataset.page === page);
  });

  if (page === 'table') renderTable();
  if (page === 'book') renderHistory();
  if (page === 'stamp') renderStamps();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

document.querySelectorAll('[data-page]').forEach(b => {
  b.onclick = () => show(b.dataset.page);
});

async function api(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error('API error');
  return response.json();
}

// 1. AIメニュー生成と選択

$('generate').onclick = async () => {
  if (order && !order.paid) {
    $('menuStatus').textContent =
      '先に現在のご注文のお会計をお願いします。';
    return;
  }

  $('generate').disabled = true;
  $('menuResults').hidden = true;
  $('menuStatus').textContent =
    '☕ マスターがメニューを考えています…';

  try {
    const data = await api('/api/cafe/menu', {
      mood: $('mood').value || 'のんびり過ごしたい',
      taste: $('taste').value,
      special: history.length >= 5
    });

    menus = data.data;
    selected = {drink: null, sweet: null};

    renderMenus();
    $('menuResults').hidden = false;
    $('menuStatus').textContent =
      history.length >= 5
        ? '常連さん限定メニューもご用意しました♡'
        : '本日のメニューができました♡';

  } catch {
    $('menuStatus').textContent =
      'メニューを生成できませんでした。API接続を確認してください。';
  } finally {
    $('generate').disabled = false;
  }
};

function renderMenus() {
  $('drinks').replaceChildren();
  $('sweets').replaceChildren();

  menus.forEach(item => {
    const chosen = selected[item.type] === item;
    const card = node('div', undefined,
      'menu-item' + (chosen ? ' chosen' : ''));

    card.append(
      node('div', item.emoji ||
        (item.type === 'drink' ? '☕' : '🍰'), 'food-icon'),
      node('h3', item.name),
      node('p', item.description),
      node('strong', yen(item.price)),
      button(chosen ? '選択済み ♡' : 'これにする', () => {
        selected[item.type] = item;
        renderMenus();
      }, chosen ? 'selected' : '')
    );

    $(item.type === 'drink' ? 'drinks' : 'sweets')
      .append(card);
  });

  const total = (selected.drink?.price || 0) +
                (selected.sweet?.price || 0);

  $('selection').textContent =
    (selected.drink?.name || 'ドリンク未選択') + ' ＋ ' +
    (selected.sweet?.name || 'スイーツ未選択') +
    ' ／ ' + yen(total);

  $('order').disabled = !(selected.drink && selected.sweet);
}

$('order').onclick = () => {
  if (!selected.drink || !selected.sweet) return;

  if (order && !order.paid) {
    alert('現在のご注文を先にお会計してください。');
    return;
  }

  order = {
    drink: {...selected.drink},
    sweet: {...selected.sweet},
    mood: $('mood').value,
    drinkLeft: 4,
    sweetLeft: 4,
    paid: false
  };

  conversation = [];
  lastReply = '';
  $('chatLog').replaceChildren();
  addChat('master', 'ご注文ありがとうございます。ごゆっくりお過ごしくださいね。');

  $('menuResults').hidden = true;
  show('table');
};

// 2. お食事タイム

function renderTable() {
  const root = $('tableContent');
  root.replaceChildren();

  if (!order) {
    root.append(
      node('p', 'まだご注文がありません。'),
      button('メニューを見る', () => show('menu'), 'primary')
    );
    return;
  }

  if (order.paid) {
    root.append(
      node('p', '本日のお食事は終了しました。'),
      button('レシートを見る', () => show('receipt'), 'primary')
    );
    return;
  }

  root.append(node('p', 'お待たせいたしました♡'));

  const table = node('div', undefined, 'tablecloth');

  ['drink', 'sweet'].forEach(type => {
    const key = type + 'Left';
    const left = order[key];
    const item = order[type];
    const area = node('div', undefined, 'food-area');

    const plate = node('div',
      left === 0 ? '♡' : item.emoji ||
      (type === 'drink' ? '☕' : '🍰'), 'plate');

    plate.style.fontSize = (24 + left * 9) + 'px';

    const progress = node('progress');
    progress.max = 4;
    progress.value = left;

    const eat = button(
      left === 0 ? 'ごちそうさま' :
      type === 'drink' ? 'ひとくち飲む' : 'いただきます',
      () => {
        order[key] = Math.max(0, order[key] - 1);
        renderTable();
      }
    );

    eat.disabled = left === 0;

    area.append(plate, node('h3', item.name), progress, eat);
    table.append(area);
  });

  root.append(table);

  if (!order.drinkLeft && !order.sweetLeft) {
    root.append(node('p', 'きれいに召し上がっていただき、ありがとうございます♡'));
  }

  root.append(
    button('マスターとおしゃべりする', () => show('talk')),
    button('お会計へ進む', checkout, 'primary')
  );
}

// 3. AIマスターとの会話

function addChat(role, text) {
  $('chatLog').append(node('div', text,
    'bubble ' + (role === 'user' ? 'user' : 'master')));
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
}

$('chatForm').onsubmit = async event => {
  event.preventDefault();

  if (talking) return;

  if (!order || order.paid) {
    addChat('master', 'ご注文のあとにお話ししましょう♡');
    return;
  }

  const message = $('chatInput').value.trim();
  if (!message) return;

  const currentOrder = order;
  talking = true;
  $('send').disabled = true;
  $('chatInput').value = '';

  addChat('user', message);

  const waiting = node('div',
    'マスターがお返事を考えています…', 'bubble');

  $('chatLog').append(waiting);

  try {
    const data = await api('/api/cafe/talk', {
      message,
      mood: order.mood,
      history: conversation
    });

    waiting.remove();

    if (order !== currentOrder || order.paid) return;

    conversation.push(
      {role: 'user', text: message},
      {role: 'master', text: data.reply}
    );

    lastReply = data.reply;
    addChat('master', data.reply);

  } catch {
    waiting.remove();
    addChat('master', '少し接続の調子が悪いようです。もう一度お話ししてくださいね。');
  } finally {
    talking = false;
    $('send').disabled = false;
  }
};

// 4. お会計・レシート・思い出の保存

function checkout() {
  if (!order || order.paid) return;

  if (order.drinkLeft || order.sweetLeft) {
    if (!confirm('まだお食事が残っています。お会計に進みますか？')) {
      return;
    }
  }

  order.paid = true;

  const record = {
    date: new Date().toISOString(),
    drink: order.drink,
    sweet: order.sweet,
    mood: order.mood,
    total: order.drink.price + order.sweet.price,
    message: lastReply ||
      '本日もご来店ありがとうございました。またお待ちしています♡'
  };

  history.unshift(record);
  save('cafeHistoryV2', history);

  renderReceipt(record);
  updateVisitBadge();
  show('receipt');
}

function renderReceipt(record) {
  const paper = node('div', undefined, 'receipt-paper');

  paper.append(
    node('h2', 'KIMAGURE CAFÉ'),
    node('p', 'きまぐれ喫茶店'),
    node('p', new Date(record.date).toLocaleString('ja-JP')),
    node('hr')
  );

  [record.drink, record.sweet].forEach(item => {
    const line = node('div', undefined, 'receipt-line');
    line.append(node('span', item.name), node('span', yen(item.price)));
    paper.append(line);
  });

  paper.append(
    node('hr'),
    node('h3', '合計 ' + yen(record.total)),
    node('p', '♡ スタンプ +1'),
    node('p', record.message),
    node('p', '※架空のお会計です')
  );

  $('receiptContent').replaceChildren(paper);
}

$('printReceipt').onclick = () => window.print();

$('newVisit').onclick = () => {
  order = null;
  selected = {drink: null, sweet: null};
  conversation = [];
  lastReply = '';

  $('mood').value = '';
  $('menuResults').hidden = true;
  $('menuStatus').textContent = '';
  $('chatLog').replaceChildren();

  show('menu');
};

// 5. 思い出帳・メニュー図鑑

function renderHistory() {
  const root = $('history');
  root.replaceChildren();

  const names = new Set();

  history.forEach(record => {
    names.add('drink:' + record.drink.name);
    names.add('sweet:' + record.sweet.name);
  });

  $('collectionCount').textContent =
    '来店 ' + history.length + '回 ／ 発見したメニュー ' +
    names.size + '種類';

  if (!history.length) {
    root.append(node('p', '最初の思い出を作りましょう♡'));
  }

  history.forEach(record => {
    const card = node('div', undefined, 'history-card');

    card.append(
      node('small', new Date(record.date).toLocaleString('ja-JP')),
      node('h3', '☕ ' + record.drink.name),
      node('p', record.drink.description),
      node('h3', '🍰 ' + record.sweet.name),
      node('p', record.sweet.description),
      node('p', record.message),
      button('レシートを見る', () => {
        renderReceipt(record);
        show('receipt');
      })
    );

    root.append(card);
  });
}

// 6. スタンプカード

function renderStamps() {
  $('stampGrid').replaceChildren();

  for (let i = 0; i < 5; i++) {
    const filled = history.length >= i + 1;
    $('stampGrid').append(node('div',
      filled ? '♥' : '♡',
      'stamp' + (filled ? ' filled' : '')));
  }

  $('stampMessage').textContent = history.length >= 5
    ? '限定メニュー解放！いつもありがとうございます♡'
    : 'あと' + (5 - history.length) + '回で限定メニュー解放！';
}

function updateVisitBadge() {
  $('visitBadge').textContent =
    '来店記録 ' + history.length + '回 ♡';
}

// 7. 模様替え

function applyDesign() {
  const walls = {
    pink: '#f8e4e7',
    cream: '#f5ead6',
    blue: '#dceaf4',
    green: '#dcebdd'
  };

  const plates = {
    white: ['#ffffff', '#e7d8cb'],
    pink: ['#fce3eb', '#d99eaf'],
    gold: ['#fffdf6', '#c6a45c']
  };

  document.documentElement.style.setProperty(
    '--wall', walls[design.wall] || walls.pink);

  const plate = plates[design.plate] || plates.white;

  document.documentElement.style.setProperty('--plate', plate[0]);
  document.documentElement.style.setProperty('--rim', plate[1]);

  document.body.dataset.cloth = design.cloth;

  document.querySelectorAll('[data-setting]').forEach(b => {
    b.classList.toggle('selected',
      design[b.dataset.setting] === b.dataset.value);
  });
}

document.querySelectorAll('[data-setting]').forEach(b => {
  b.onclick = () => {
    design[b.dataset.setting] = b.dataset.value;
    save('cafeDesignV2', design);
    applyDesign();
  };
});

applyDesign();
updateVisitBadge();
renderStamps();
show('menu');
