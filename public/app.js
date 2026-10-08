'use strict';

/*
 * واجهة نظام الحضور: JavaScript عادي بلا مكتبات ولا خطوة بناء.
 *
 * الترتيب في هذا الملف:
 *   1. أدوات صغيرة (اختيار عناصر، بناء عناصر، تنسيق الوقت)
 *   2. api(): الدالة الوحيدة التي تكلّم الخادم
 *   3. الدخول والخروج والتنقل بين الشاشات
 *   4. شاشة الموظف
 *   5. شاشة الإدارة (كشف اليوم، الموظفون، السجل، نافذة التعديل)
 *
 * ملاحظة عن الأوقات: الخادم يرسلها بتوقيت UTC، والمتصفح يعرضها بتوقيت
 * الجهاز. المفترض أن أجهزة الشركة مضبوطة على توقيت البلد نفسه الذي
 * يحسب به الخادم يوم العمل (APP_TIMEZONE).
 */

// ═════════════════════ 1. أدوات ═════════════════════

const $ = (id) => document.getElementById(id);

/**
 * يبني عنصر HTML:  el('td', { className: 'actions' }, 'نص', عنصرٌ آخر)
 *
 * النصوص تُضاف دائمًا كنص (append) لا كـ HTML. لذلك لو سمّى أحدهم نفسه
 * "<script>..." فسيظهر الاسم حرفيًّا ولن يُنفَّذ. لا نستخدم innerHTML
 * مع أي بيانات قادمة من الخادم في أي مكان من هذا الملف.
 */
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null && child !== ''));
  return node;
}

/** يستبدل محتوى جدول بصفوف جديدة، أو برسالة إن كان فارغًا. */
function fillTable(tbody, rows, emptyText, columns) {
  tbody.replaceChildren(
    ...(rows.length
      ? rows
      : [el('tr', {}, el('td', { className: 'empty', colSpan: columns }, emptyText))]),
  );
}

function showError(node, message) {
  node.textContent = message ?? '';
  node.hidden = !message;
}

// nu-latn: أرقام 0-9 حتى تبقى الأعمدة مصفوفة وسهلة القراءة
const LOCALE = 'ar-SY-u-nu-latn';
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const clockFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const formatTime = (iso) => (iso ? timeFormat.format(new Date(iso)) : '—');
// workDate نص "YYYY-MM-DD" بلا وقت؛ نقرؤه كـ UTC ونعرضه كـ UTC فلا ينزاح يومًا.
const formatDay = (workDate) => dayFormat.format(new Date(`${workDate}T00:00:00Z`));

/** مدة بالميلي ثانية => "7س 05د" */
function formatMs(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(minutes / 60)}س ${String(minutes % 60).padStart(2, '0')}د`;
}

function formatDuration(checkIn, checkOut) {
  if (!checkIn) return '—';
  const end = checkOut ? new Date(checkOut) : serverNow();
  return formatMs(end - new Date(checkIn));
}

/**
 * يربط حقلَي "من" و"إلى" في نموذج فلترة:
 * "إلى" معطَّل ما دام "من" فارغًا، ولا يقبل تاريخًا قبل "من".
 */
function bindRange(form) {
  const sync = () => {
    form.to.disabled = !form.from.value;
    form.to.min = form.from.value;
    if (!form.from.value) form.to.value = '';
  };
  form.from.addEventListener('input', sync);
  sync();
}

/** قيم الفلتر غير الفارغة تُضاف إلى params. الحقل المعطَّل لا يُرسَل. */
function addFilters(params, form, names) {
  for (const name of names) {
    if (form[name].value && !form[name].disabled) params.set(name, form[name].value);
  }
  return params;
}

/** وقت ISO => "HH:MM" لحقل <input type="time"> */
function toTimeInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// ═════════════════════ 2. الاتصال بالخادم ═════════════════════

const TOKEN_KEY = 'attendance.token';

const state = {
  // التوكن في localStorage ليبقى المستخدم داخلًا بعد تحديث الصفحة.
  token: localStorage.getItem(TOKEN_KEY),
  user: null,
  clockOffset: 0, // الفرق بين ساعة الخادم وساعة هذا الجهاز
  today: null,
  log: { page: 1, pages: 1 },
  editing: null,
};

const serverNow = () => new Date(Date.now() + state.clockOffset);

/**
 * كل طلب إلى الخادم يمر من هنا، فمعالجة التوكن والأخطاء مكتوبة مرة واحدة.
 * عند الفشل ترمي Error رسالته هي رسالة الخادم (العربية) جاهزة للعرض.
 */
async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (response.ok) return data;

  // 401 ونحن نحمل توكنًا = انتهت صلاحيته أو عُطّل الحساب => عُد لشاشة الدخول
  if (response.status === 401 && state.token) {
    logout();
    throw new Error('انتهت الجلسة، سجّل دخولك من جديد');
  }
  if (response.status === 429) {
    throw new Error('محاولات كثيرة، انتظر دقيقة ثم حاول');
  }
  // class-validator يرجع message كمصفوفة أخطاء، وبقية الأخطاء كنص واحد
  const message = Array.isArray(data?.message) ? data.message.join('، ') : data?.message;
  throw new Error(message || `خطأ غير متوقع (${response.status})`);
}

// ═════════════════════ 3. الدخول والتنقل ═════════════════════

let clockTimer = null;

function show(view) {
  for (const name of ['login', 'employee', 'admin']) {
    $(`view-${name}`).hidden = name !== view;
  }
  $('topbar').hidden = view === 'login';
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  state.token = null;
  state.user = null;
  clearInterval(clockTimer);
  show('login');
}

async function enter() {
  $('user-name').textContent = state.user.name;
  // إخفاء شاشة الإدارة عن الموظف هنا للراحة فقط وليس حماية:
  // الحماية الحقيقية في الخادم (RolesGuard)، وأي أحد يستطيع تعديل هذا الملف.
  if (state.user.role === 'admin') {
    show('admin');
    await Promise.all([loadDaily(), loadUsers()]);
  } else {
    show('employee');
    await loadEmployee();
  }
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); // امنع المتصفح من إعادة تحميل الصفحة
  const form = event.currentTarget;
  showError($('login-error'), null);
  try {
    const result = await api('/auth/login', {
      method: 'POST',
      body: { username: form.username.value, password: form.password.value },
    });
    state.token = result.accessToken;
    state.user = result.user;
    localStorage.setItem(TOKEN_KEY, state.token);
    form.reset();
    await enter();
  } catch (error) {
    showError($('login-error'), error.message);
  }
});

$('logout').addEventListener('click', logout);

// ═════════════════════ 4. شاشة الموظف ═════════════════════

async function loadEmployee() {
  const [today] = await Promise.all([api('/attendance/today'), loadMine()]);

  // نعرض ساعة الخادم: هي التي ستُسجَّل فعلًا، لا ساعة جهاز الموظف.
  state.clockOffset = new Date(today.serverTime) - Date.now();
  state.today = today;

  $('today-date').textContent = formatDay(today.workDate);
  renderToday();

  clearInterval(clockTimer);
  clockTimer = setInterval(tick, 1000);
  tick();
}

/** سجل الموظف مع فلتر التاريخ وعدّادَي السجلات والساعات. */
async function loadMine() {
  showError($('my-error'), null);
  const params = addFilters(new URLSearchParams({ limit: MY_PAGE_SIZE }), $('my-form'), ['from', 'to']);

  let mine;
  try {
    mine = await api(`/attendance/me?${params}`);
  } catch (error) {
    return showError($('my-error'), error.message);
  }

  // العدّادان من الخادم ويغطّيان الفترة كلها، لا الصفوف المعروضة فقط.
  $('my-count').textContent = mine.total;
  $('my-hours').textContent = formatMs(mine.workedMs);

  fillTable(
    $('my-records'),
    mine.items.map((record) =>
      el('tr', {},
        el('td', {}, formatDay(record.workDate)),
        el('td', {}, formatTime(record.checkIn)),
        el('td', {}, formatTime(record.checkOut)),
        el('td', {}, record.checkOut ? formatDuration(record.checkIn, record.checkOut) : '—'),
      ),
    ),
    'لا توجد سجلات مطابقة',
    4,
  );
}

// الحد الأعلى الذي يقبله الخادم لصفحة واحدة.
const MY_PAGE_SIZE = 100;

bindRange($('my-form'));
$('my-form').addEventListener('submit', (event) => {
  event.preventDefault();
  loadMine();
});

function tick() {
  $('clock').textContent = clockFormat.format(serverNow());
  // المدة تتحرك مع الساعة ما دام الموظف في الدوام
  const record = state.today?.attendance;
  if (record && !record.checkOut) {
    $('today-duration').textContent = formatDuration(record.checkIn, null);
  }
}

/** الزر الواحد يتبدّل بين ثلاث حالات حسب سجل اليوم. */
function renderToday() {
  const record = state.today.attendance;
  const button = $('punch-button');

  $('today-in').textContent = formatTime(record?.checkIn);
  $('today-out').textContent = formatTime(record?.checkOut);
  $('today-duration').textContent = record ? formatDuration(record.checkIn, record.checkOut) : '—';

  button.classList.remove('out', 'done');
  if (!record) {
    button.textContent = 'تسجيل الحضور';
    button.disabled = false;
  } else if (!record.checkOut) {
    button.textContent = 'تسجيل الانصراف';
    button.classList.add('out');
    button.disabled = false;
  } else {
    button.textContent = 'اكتمل دوام اليوم';
    button.classList.add('done');
    button.disabled = true;
  }
}

$('punch-button').addEventListener('click', async () => {
  const button = $('punch-button');
  const checkingOut = Boolean(state.today.attendance);

  // الانصراف لا يُتراجع عنه إلا عبر الإدارة، فنطلب تأكيدًا.
  if (checkingOut && !confirm('تأكيد تسجيل الانصراف؟')) return;

  // نعطّل الزر فورًا لمنع الضغطة المزدوجة.
  // (والخادم يمنعها أيضًا: لا نعتمد على الواجهة وحدها أبدًا.)
  button.disabled = true;
  $('punch-message').textContent = '';
  try {
    // الطلب بلا جسم: لا نرسل وقتًا ولا هوية. الخادم يعرف الاثنين.
    await api(checkingOut ? '/attendance/check-out' : '/attendance/check-in', { method: 'POST' });
    $('punch-message').textContent = checkingOut ? 'سُجّل انصرافك' : 'سُجّل حضورك';
  } catch (error) {
    $('punch-message').textContent = error.message;
  }
  await loadEmployee();
});

// ═════════════════════ 5. شاشة الإدارة ═════════════════════

// ───── التبويبات ─────
for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const other of document.querySelectorAll('.tab')) {
      other.classList.toggle('active', other === tab);
      $(`tab-${other.dataset.tab}`).hidden = other !== tab;
    }
    if (tab.dataset.tab === 'log') loadLog();
    if (tab.dataset.tab === 'daily') loadDaily();
  });
}

const activeTab = () => document.querySelector('.tab.active').dataset.tab;
const reloadActiveTab = () => (activeTab() === 'log' ? loadLog() : loadDaily());

function editedMark(record) {
  return record?.editedAt
    ? el('span', { className: 'edited', title: 'عُدّل يدويًّا من الإدارة' }, '(معدَّل)')
    : null;
}

// ───── كشف اليوم ─────
async function loadDaily() {
  const date = $('daily-date').value;
  const data = await api(`/attendance/daily${date ? `?date=${date}` : ''}`);
  $('daily-date').value = data.workDate;

  const counts = { present: 0, left: 0, absent: 0 };

  const rows = data.rows.map(({ employee, attendance }) => {
    const status = !attendance ? 'absent' : attendance.checkOut ? 'left' : 'present';
    counts[status] += 1;
    const label = { absent: 'لم يحضر', present: 'في الدوام', left: 'انصرف' }[status];

    const button = el('button', { className: 'btn ghost small', type: 'button' },
      attendance ? 'تعديل' : 'تسجيل يدوي');
    button.addEventListener('click', () =>
      openEdit({ workDate: data.workDate, employee, attendance }));

    return el('tr', {},
      el('td', {}, employee.name),
      el('td', {}, el('span', { className: `badge ${status}` }, label)),
      el('td', {}, formatTime(attendance?.checkIn), editedMark(attendance)),
      el('td', {}, formatTime(attendance?.checkOut)),
      el('td', {}, attendance ? formatDuration(attendance.checkIn, attendance.checkOut) : '—'),
      el('td', { className: 'actions' }, button),
    );
  });

  $('stat-present').textContent = counts.present;
  $('stat-left').textContent = counts.left;
  $('stat-absent').textContent = counts.absent;
  fillTable($('daily-rows'), rows, 'لا يوجد موظفون بعد. أضفهم من تبويب «الموظفون».', 6);
}

$('daily-date').addEventListener('change', loadDaily);
$('daily-refresh').addEventListener('click', loadDaily);

// ───── الموظفون ─────
async function loadUsers() {
  const users = await api('/users');

  const rows = users.map((user) => {
    const actions = el('td', { className: 'actions' });

    if (user.role === 'employee') {
      const reset = el('button', { className: 'btn ghost small', type: 'button' }, 'كلمة مرور جديدة');
      reset.addEventListener('click', () => resetPassword(user));

      const toggle = el('button', { className: 'btn ghost small', type: 'button' },
        user.isActive ? 'تعطيل' : 'تفعيل');
      toggle.addEventListener('click', () => toggleActive(user));

      actions.append(reset, toggle);
    }

    return el('tr', {},
      el('td', {}, user.name),
      el('td', { dir: 'ltr' }, user.username),
      el('td', {}, user.role === 'admin' ? 'مدير' : 'موظف'),
      el('td', {}, el('span', { className: `badge ${user.isActive ? 'present' : 'off'}` },
        user.isActive ? 'فعّال' : 'معطّل')),
      actions,
    );
  });
  fillTable($('user-rows'), rows, 'لا يوجد مستخدمون', 5);

  // قائمة الموظفين في فلتر السجل
  $('log-employee').replaceChildren(
    el('option', { value: '' }, 'الكل'),
    ...users
      .filter((user) => user.role === 'employee')
      .map((user) => el('option', { value: user._id }, user.name)),
  );
}

async function resetPassword(user) {
  const password = prompt(`كلمة مرور جديدة للموظف «${user.name}» (6 أحرف على الأقل):`);
  if (!password) return;
  try {
    await api(`/users/${user._id}`, { method: 'PATCH', body: { password } });
    alert('تم تغيير كلمة المرور');
  } catch (error) {
    alert(error.message);
  }
}

async function toggleActive(user) {
  if (user.isActive && !confirm(`تعطيل حساب «${user.name}»؟ لن يستطيع الدخول بعدها.`)) return;
  try {
    await api(`/users/${user._id}`, { method: 'PATCH', body: { isActive: !user.isActive } });
    await Promise.all([loadUsers(), loadDaily()]);
  } catch (error) {
    alert(error.message);
  }
}

$('user-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  showError($('user-error'), null);
  try {
    // FormData يجمع حقول النموذج حسب السمة name: { name, username, password }
    await api('/users', {
      method: 'POST',
      body: Object.fromEntries(new FormData(form)),
    });
    form.reset();
    await Promise.all([loadUsers(), loadDaily()]);
  } catch (error) {
    showError($('user-error'), error.message);
  }
});

// ───── السجل ─────
const LOG_PAGE_SIZE = 25;

async function loadLog() {
  const form = $('log-form');
  // URLSearchParams يتكفّل بترميز القيم، فلا نلصق نصوصًا في الرابط يدويًّا.
  const params = addFilters(
    new URLSearchParams({ page: state.log.page, limit: LOG_PAGE_SIZE }),
    form,
    ['from', 'to', 'employee'],
  );

  showError($('log-error'), null);
  let data;
  try {
    data = await api(`/attendance?${params}`);
  } catch (error) {
    return showError($('log-error'), error.message);
  }
  state.log.pages = Math.max(1, Math.ceil(data.total / data.limit));

  // العدّادان يغطّيان كل ما يطابق الفلتر، لا الصفحة الحالية فقط.
  $('log-count').textContent = data.total;
  $('log-hours').textContent = formatMs(data.workedMs);

  // الخادم يرسل employees فقط حين لا يُحدَّد موظف (عرض "الكل").
  const cards = (data.employees ?? []).map(({ employee, records, workedMs }) => {
    const card = el('button', { className: 'emp-card', type: 'button', title: 'عرض سجلات هذا الموظف' },
      el('span', {}, employee.name),
      el('b', {}, formatMs(workedMs)),
      el('span', { className: 'muted small' }, `${records} سجل`),
    );
    card.addEventListener('click', () => {
      selectLogEmployee(employee);
      state.log.page = 1;
      loadLog();
    });
    return card;
  });
  $('log-cards').replaceChildren(...cards);
  $('log-cards').hidden = cards.length === 0;

  const rows = data.items.map((record) => {
    const button = el('button', { className: 'btn ghost small', type: 'button' }, 'تعديل');
    button.addEventListener('click', () =>
      openEdit({ workDate: record.workDate, employee: record.employee, attendance: record }));

    return el('tr', {},
      el('td', {}, formatDay(record.workDate)),
      el('td', {}, record.employee?.name ?? '(محذوف)'),
      el('td', {}, formatTime(record.checkIn), editedMark(record)),
      el('td', {}, formatTime(record.checkOut)),
      el('td', {}, record.checkOut ? formatDuration(record.checkIn, record.checkOut) : '—'),
      el('td', { className: 'actions' }, button),
    );
  });
  fillTable($('log-rows'), rows, 'لا توجد سجلات مطابقة', 6);

  $('log-page').textContent = `صفحة ${state.log.page} من ${state.log.pages} — ${data.total} سجل`;
  $('log-prev').disabled = state.log.page <= 1;
  $('log-next').disabled = state.log.page >= state.log.pages;
}

/** يختار موظفًا في قائمة الفلتر. المعطَّل ليس في القائمة فنضيفه عند الحاجة. */
function selectLogEmployee(employee) {
  const select = $('log-employee');
  if (![...select.options].some((option) => option.value === employee.id)) {
    select.append(el('option', { value: employee.id }, employee.name));
  }
  select.value = employee.id;
}

bindRange($('log-form'));
$('log-form').addEventListener('submit', (event) => {
  event.preventDefault();
  state.log.page = 1; // فلتر جديد => ابدأ من الصفحة الأولى
  loadLog();
});
$('log-prev').addEventListener('click', () => {
  state.log.page -= 1;
  loadLog();
});
$('log-next').addEventListener('click', () => {
  state.log.page += 1;
  loadLog();
});

// ───── نافذة التصحيح اليدوي ─────
function openEdit({ workDate, employee, attendance }) {
  state.editing = { workDate, employee, attendance };
  const form = $('edit-form');
  $('edit-title').textContent = attendance ? 'تعديل السجل' : 'تسجيل يدوي';
  $('edit-subtitle').textContent = `${employee?.name ?? ''} — ${formatDay(workDate)}`;
  form.checkIn.value = toTimeInput(attendance?.checkIn);
  form.checkOut.value = toTimeInput(attendance?.checkOut);
  showError($('edit-error'), null);
  $('edit-dialog').showModal();
}

$('edit-cancel').addEventListener('click', () => $('edit-dialog').close());

$('edit-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const { workDate, employee, attendance } = state.editing;

  // "2026-10-07" + "08:30" => وقت محلي => ISO بتوقيت UTC للخادم
  const toIso = (time) => new Date(`${workDate}T${time}`).toISOString();
  const checkIn = toIso(form.checkIn.value);
  const checkOut = form.checkOut.value ? toIso(form.checkOut.value) : null;

  try {
    if (attendance) {
      // null صريحة = "أعد فتح السجل"
      await api(`/attendance/${attendance._id}`, { method: 'PATCH', body: { checkIn, checkOut } });
    } else {
      await api('/attendance', {
        method: 'POST',
        body: { employee: employee.id, checkIn, ...(checkOut ? { checkOut } : {}) },
      });
    }
    $('edit-dialog').close();
    await reloadActiveTab();
  } catch (error) {
    showError($('edit-error'), error.message);
  }
});

// ═════════════════════ البداية ═════════════════════

(async function start() {
  if (!state.token) return show('login');
  try {
    // توكن محفوظ من زيارة سابقة: نسأل الخادم هل ما زال صالحًا
    state.user = await api('/auth/me');
    await enter();
  } catch {
    show('login');
  }
})();
