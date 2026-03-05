// Initialize Gun.js with a public relay
const gun = Gun(['https://gun-manhattan.herokuapp.com/gun']);
const app = gun.get('split-bill-v1-gonzalo');

// App State
const state = {
    users: [
        { id: 0, name: 'Usuario 1', color: '#ef4444' },
        { id: 1, name: 'Usuario 2', color: '#10b981' },
        { id: 2, name: 'Usuario 3', color: '#f59e0b' }
    ],
    expenses: []
};

// DOM Elements
const totalAmountEl = document.getElementById('total-amount');
const expenseListEl = document.getElementById('expense-list');
const settlementListEl = document.getElementById('settlement-list');
const btnAddExpense = document.getElementById('btn-add-expense');
const modalOverlay = document.getElementById('modal-overlay');
const closeModal = document.getElementById('close-modal');
const expenseForm = document.getElementById('expense-form');

// Listen for expenses from Gun.js
app.get('expenses').map().on((data, id) => {
    if (!data) return;

    // Find if it already exists or add new
    const index = state.expenses.findIndex(e => e.id === id);
    if (index > -1) {
        state.expenses[index] = { ...data, id };
    } else {
        state.expenses.unshift({ ...data, id });
    }

    // Sort by date (descending)
    state.expenses.sort((a, b) => b.timestamp - a.timestamp);

    renderApp();
});

// Functions
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS'
    }).format(amount);
};

const calculateSplits = () => {
    const total = state.expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
    const perPerson = total / 3;

    const paid = [0, 0, 0];
    state.expenses.forEach(exp => {
        paid[exp.payerId] += parseFloat(exp.amount);
    });

    // Balance: what you paid minus what you should have paid
    const balances = paid.map(amount => amount - perPerson);

    return { total, perPerson, balances };
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

        settlements.push({
            from: debtor.id,
            to: creditor.id,
            amount: settledAmount
        });

        debtor.amount -= settledAmount;
        creditor.amount -= settledAmount;

        if (debtor.amount <= 0.01) d++;
        if (creditor.amount <= 0.01) c++;
    }

    return settlements;
};

const renderApp = () => {
    const { total, perPerson, balances } = calculateSplits();
    const settlements = getSettlements(balances);

    // Update Totals
    totalAmountEl.textContent = formatCurrency(total);

    // Update Individual Balances
    balances.forEach((bal, i) => {
        const el = document.getElementById(`balance-${i}`);
        el.textContent = formatCurrency(bal);
        el.classList.remove('positive', 'negative');
        if (bal > 0.1) el.classList.add('positive');
        else if (bal < -0.1) el.classList.add('negative');
    });

    // Update Settlements
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

    // Update Expense List
    expenseListEl.innerHTML = state.expenses.map(exp => `
        <li class="expense-item">
            <div class="expense-info">
                <h4>${exp.desc}</h4>
                <p>Pagado por ${state.users[exp.payerId].name}</p>
            </div>
            <div class="expense-meta">
                <div class="expense-price">${formatCurrency(exp.amount)}</div>
                <p>${new Date(exp.timestamp).toLocaleDateString()}</p>
            </div>
        </li>
    `).join('');
};

// Event Listeners
btnAddExpense.addEventListener('click', () => {
    modalOverlay.classList.remove('hidden');
});

closeModal.addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
});

expenseForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const desc = document.getElementById('exp-desc').value;
    const amount = document.getElementById('exp-amount').value;
    const payerId = document.querySelector('input[name="payer"]:checked').value;

    if (!desc || !amount) return;

    // Add to Gun.js
    app.get('expenses').set({
        desc,
        amount,
        payerId: parseInt(payerId),
        timestamp: Date.now()
    });

    expenseForm.reset();
    modalOverlay.classList.add('hidden');
});

// Initial Render
renderApp();
