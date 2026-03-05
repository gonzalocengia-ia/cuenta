// Initialize Gun.js with multiple public relays for better availability
const relays = [
    'https://gun-manhattan.herokuapp.com/gun',
    'https://gun-us.herokuapp.com/gun',
    'https://gun-eu.herokuapp.com/gun',
    'https://dweb.link/gun'
];
const gun = Gun(relays);
const app = gun.get('split-bill-v2-gonzalo-stable'); // Stable namespace

// Connection Status Monitor
const syncDot = document.getElementById('sync-dot');
const syncText = document.getElementById('sync-text');

// Gun.js doesn't have a direct "on connect" for all relays easily, 
// but we can monitor peers.
setInterval(() => {
    const peers = Object.keys(gun.back('opt.peers') || {});
    const connected = peers.some(p => gun.back('opt.peers')[p].wire && gun.back('opt.peers')[p].wire.readyState === 1);

    if (connected) {
        syncDot.style.background = '#10b981';
        syncDot.style.boxShadow = '0 0 10px #10b981';
        syncText.textContent = 'Conectado';
    } else {
        syncDot.style.background = '#ef4444';
        syncDot.style.boxShadow = '0 0 10px #ef4444';
        syncText.textContent = 'Reconectando...';
    }
}, 3000);

// App State
const state = {
    users: [
        { id: 0, name: 'Usuario 1', color: '#ef4444' },
        { id: 1, name: 'Usuario 2', color: '#10b981' },
        { id: 2, name: 'Usuario 3', color: '#f59e0b' }
    ],
    items: [] // Will contain both expenses and contributions
};

// DOM Elements
const totalAmountEl = document.getElementById('total-amount');
const expenseListEl = document.getElementById('expense-list');
const settlementListEl = document.getElementById('settlement-list');
const btnAddExpense = document.getElementById('btn-add-expense');
const btnAddFund = document.getElementById('btn-add-fund');
const modalOverlay = document.getElementById('modal-overlay');
const closeModal = document.getElementById('close-modal');
const expenseForm = document.getElementById('expense-form');
const modalTitle = document.getElementById('modal-title');
const entryTypeInput = document.getElementById('entry-type');
const groupDesc = document.getElementById('group-desc');
const labelUser = document.getElementById('label-user');
const btnSubmit = document.getElementById('btn-submit');
const tabBtns = document.querySelectorAll('.tab-btn');

// Listen for items from Gun.js
app.get('items').map().on((data, id) => {
    if (!data) return;

    const index = state.items.findIndex(e => e.id === id);
    if (index > -1) {
        state.items[index] = { ...data, id };
    } else {
        state.items.unshift({ ...data, id });
    }

    state.items.sort((a, b) => b.timestamp - a.timestamp);
    renderApp();
});

// UI Helpers
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS'
    }).format(amount);
};

const setModalType = (type) => {
    entryTypeInput.value = type;
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.type === type));

    if (type === 'expense') {
        modalTitle.textContent = 'Registrar Gasto';
        groupDesc.style.display = 'block';
        labelUser.textContent = '¿Quién pagó?';
        btnSubmit.textContent = 'Agregar Gasto';
    } else {
        modalTitle.textContent = 'Aportar Plata';
        groupDesc.style.display = 'none';
        labelUser.textContent = '¿Quién aporta?';
        btnSubmit.textContent = 'Confirmar Aporte';
    }
};

// Logic
const calculateApp = () => {
    let totalSpent = 0;
    const contributions = [0, 0, 0];

    state.items.forEach(item => {
        const amount = parseFloat(item.amount);
        if (item.type === 'expense') {
            totalSpent += amount;
            contributions[item.payerId] += amount;
        } else if (item.type === 'contribution') {
            contributions[item.payerId] += amount;
        }
    });

    const perPersonDebt = totalSpent / 3;
    const balances = contributions.map(c => c - perPersonDebt);

    return { totalSpent, balances };
};

const getSettlements = (balances) => {
    const debtors = [];
    const creditors = [];

    balances.forEach((bal, i) => {
        if (bal < -0.01) debtors.push({ id: i, amount: Math.abs(bal) });
        else if (bal > 0.01) creditors.push({ id: i, amount: bal });
    });

    const settlements = [];
    let d = 0, c = 0;
    while (d < debtors.length && c < creditors.length) {
        const debtor = debtors[d];
        const creditor = creditors[c];
        const settledAmount = Math.min(debtor.amount, creditor.amount);

        settlements.push({ from: debtor.id, to: creditor.id, amount: settledAmount });

        debtor.amount -= settledAmount;
        creditor.amount -= settledAmount;

        if (debtor.amount <= 0.01) d++;
        if (creditor.amount <= 0.01) c++;
    }
    return settlements;
};

const renderApp = () => {
    const { totalSpent, balances } = calculateApp();
    const settlements = getSettlements(balances);

    totalAmountEl.textContent = formatCurrency(totalSpent);

    balances.forEach((bal, i) => {
        const el = document.getElementById(`balance-${i}`);
        el.textContent = formatCurrency(bal);
        el.classList.remove('positive', 'negative');
        if (bal > 0.1) el.classList.add('positive');
        else if (bal < -0.1) el.classList.add('negative');
    });

    if (settlements.length === 0) {
        settlementListEl.innerHTML = '<p class="placeholder">Todo saldado, ¡genial!</p>';
    } else {
        settlementListEl.innerHTML = settlements.map(s => `
            <div class="settlement-item">
                <span><b>${state.users[s.from].name}</b> debe</span>
                <i class="fas fa-long-arrow-alt-right"></i>
                <span><b>${state.users[s.to].name}</b></span>
                <span class="price">${formatCurrency(s.amount)}</span>
            </div>
        `).join('');
    }

    expenseListEl.innerHTML = state.items.map(item => `
        <li class="expense-item">
            <div class="expense-info">
                <h4>${item.type === 'expense' ? item.desc : 'Aporte de Capital'}</h4>
                <p>${item.type === 'expense' ? 'Pagado por' : 'Aportado por'} ${state.users[item.payerId].name}</p>
            </div>
            <div class="expense-meta">
                <div class="expense-price" style="color: ${item.type === 'contribution' ? '#10b981' : 'inherit'}">
                    ${item.type === 'contribution' ? '+' : ''}${formatCurrency(item.amount)}
                </div>
                <p>${new Date(item.timestamp).toLocaleDateString()}</p>
            </div>
        </li>
    `).join('');
};

// Events
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => setModalType(btn.dataset.type));
});

btnAddExpense.addEventListener('click', () => {
    setModalType('expense');
    modalOverlay.classList.remove('hidden');
});

btnAddFund.addEventListener('click', () => {
    setModalType('contribution');
    modalOverlay.classList.remove('hidden');
});

closeModal.addEventListener('click', () => modalOverlay.classList.add('hidden'));

expenseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = entryTypeInput.value;
    const desc = document.getElementById('exp-desc').value || (type === 'contribution' ? 'Aporte' : '');
    const amount = document.getElementById('exp-amount').value;
    const payerId = document.querySelector('input[name="payer"]:checked').value;

    if (!amount) return;

    app.get('items').set({
        type,
        desc,
        amount: parseFloat(amount),
        payerId: parseInt(payerId),
        timestamp: Date.now()
    });

    expenseForm.reset();
    modalOverlay.classList.add('hidden');
});

// Initial
renderApp();
