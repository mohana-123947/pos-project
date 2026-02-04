// --- CONFIG ---
// Points to your Flask Backend
const API_URL = "http://127.0.0.1:5000/api"; 

// --- DATA INITIALIZATION ---
let products = [];
let sales = [];
let cart = [];
let currentEditId = null;

// --- AUTHENTICATION ---
const loginForm = document.getElementById('login-form');
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    
    const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
    });

    if(response.ok) {
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('app-layout').classList.remove('hidden');
        showToast('Welcome back, Admin!');
        initDashboard();
    } else {
        showToast('Invalid Credentials!');
    }
});

const logout = () => {
    document.getElementById('app-layout').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
};

// --- ROUTING ---
function router(viewName) {
    // Hide all views
    ['dashboard', 'pos', 'inventory', 'sales'].forEach(v => {
        document.getElementById(v + '-view').classList.add('hidden');
        // Update active nav (simplified)
        const links = document.querySelectorAll('.nav-link');
        links.forEach(l => l.classList.remove('active'));
    });

    // Show selected
    document.getElementById(viewName + '-view').classList.remove('hidden');
    // Highlight nav (simplified index logic)
    const index = ['dashboard','pos','inventory','sales'].indexOf(viewName);
    if(index >= 0) document.querySelectorAll('.nav-link')[index].classList.add('active');

    if(viewName === 'dashboard') initDashboard();
    if(viewName === 'pos') fetchProducts();
    if(viewName === 'inventory') fetchProducts();
    if(viewName === 'sales') fetchSales();
}

// --- API CALLS & DATA FETCHING ---

async function fetchProducts() {
    try {
        const res = await fetch(`${API_URL}/products`);
        products = await res.json();
        
        // Render POS Grid
        const grid = document.getElementById('product-grid');
        grid.innerHTML = '';
        products.forEach(p => {
            // Handle Image Path
            p.img = p.img.startsWith('http') ? p.img : `http://127.0.0.1:5000${p.img}`;
            
            const isLow = p.stock < 5;
            const card = document.createElement('div');
            card.className = 'product-card';
            card.style.opacity = p.stock === 0 ? '0.5' : '1';
            card.style.pointerEvents = p.stock === 0 ? 'none' : 'cursor';
            card.onclick = () => { if(p.stock > 0) addToCart(p.id); };
            
            card.innerHTML = `
                <img src="${p.img}" class="prod-img" onerror="this.src='https://via.placeholder.com/100'">
                <div class="prod-name">${p.name}</div>
                <div class="prod-price">₹${p.price}</div>
                <div class="prod-stock ${isLow ? 'stock-low' : ''}">Stock: ${p.stock}</div>
            `;
            grid.appendChild(card);
        });

        // Render Inventory Table
        const tbody = document.getElementById('inventory-table-body');
        tbody.innerHTML = '';
        products.forEach(p => {
            tbody.innerHTML += `
                <tr>
                    <td><img src="${p.img}" width="40" height="40" style="border-radius:50%; object-fit:cover;"></td>
                    <td>${p.name}</td>
                    <td><span class="badge badge-${p.category.toLowerCase()}">${p.category}</span></td>
                    <td>₹${p.price}</td>
                    <td>${p.stock}</td>
                    <td>
                        <button class="btn btn-secondary btn-icon" onclick="editProduct(${p.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-danger btn-icon" onclick="deleteProduct(${p.id})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        showToast("Failed to load products. Is backend running?");
    }
}

async function fetchStats() {
    try {
        const res = await fetch(`${API_URL}/stats`);
        const stats = await res.json();
        
        document.getElementById('stat-today').innerText = `₹${stats.today.toFixed(2)}`;
        document.getElementById('stat-month').innerText = `₹${stats.month.toFixed(2)}`;
        document.getElementById('stat-revenue').innerText = `₹${stats.revenue.toFixed(2)}`;
        document.getElementById('stat-bills').innerText = stats.bills;
        
        const alertBox = document.getElementById('low-stock-alert');
        alertBox.style.display = stats.lowStock > 0 ? 'block' : 'none';

        // Fetch recent sales separately for the table
        const salesRes = await fetch(`${API_URL}/sales`);
        sales = await salesRes.json();
        
        const tbody = document.querySelector('#recent-sales-table tbody');
        tbody.innerHTML = '';
        sales.slice(-5).reverse().forEach(s => {
            tbody.innerHTML += `
                <tr>
                    <td>#${s.invoiceId}</td>
                    <td>${s.customerName}</td>
                    <td>₹${s.total.toFixed(2)}</td>
                    <td>${new Date(s.date).toLocaleTimeString()}</td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
    }
}

async function fetchSales() {
    try {
        const res = await fetch(`${API_URL}/sales`);
        const allSales = await res.json();
        const tbody = document.getElementById('sales-history-body');
        tbody.innerHTML = '';
        
        allSales.forEach(s => {
            const dateObj = new Date(s.date);
            tbody.innerHTML += `
                <tr>
                    <td>#${s.invoiceId}</td>
                    <td>${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}</td>
                    <td>${s.customerName}</td>
                    <td>${s.customerPhone}</td>
                    <td>₹${s.total.toFixed(2)}</td>
                    <td>${s.paymentMethod}</td>
                    <td><button class="btn btn-secondary btn-icon" onclick='viewReceipt(${JSON.stringify(s)})'><i class="fas fa-eye"></i></button></td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
    }
}

function initDashboard() {
    document.getElementById('current-date').innerText = new Date().toLocaleDateString();
    fetchStats();
}

// --- POS MODULE LOGIC ---
function addToCart(id) {
    const prod = products.find(p => p.id === id);
    const existing = cart.find(c => c.id === id);
    if(existing) {
        if(existing.qty < prod.stock) existing.qty++;
        else { showToast("Max stock reached!"); return; }
    } else {
        cart.push({ ...prod, qty: 1 });
    }
    renderCart();
}

function updateQty(id, change) {
    const item = cart.find(c => c.id === id);
    const prod = products.find(p => p.id === id);
    if(change === 1 && item.qty < prod.stock) item.qty++;
    else if (change === -1) item.qty--;
    if(item.qty === 0) cart = cart.filter(c => c.id !== id);
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    if(cart.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #ccc; margin-top: 50px;"><i class="fas fa-shopping-cart" style="font-size: 2rem;"></i><br>Cart is empty</div>`;
        updateTotals(0);
        return;
    }
    container.innerHTML = '';
    let subtotal = 0;
    cart.forEach(item => {
        subtotal += item.price * item.qty;
        container.innerHTML += `
            <div class="cart-item">
                <div class="cart-item-info"><div class="cart-item-title">${item.name}</div><div class="cart-item-price">₹${item.price} x ${item.qty}</div></div>
                <div class="cart-controls">
                    <button class="qty-btn" onclick="updateQty(${item.id}, -1)">-</button>
                    <span>${item.qty}</span>
                    <button class="qty-btn" onclick="updateQty(${item.id}, 1)">+</button>
                </div>
            </div>`;
    });
    updateTotals(subtotal);
}

function updateTotals(sub) {
    const tax = sub * 0.05;
    const total = sub + tax;
    document.getElementById('cart-subtotal').innerText = `₹${sub.toFixed(2)}`;
    document.getElementById('cart-tax').innerText = `₹${tax.toFixed(2)}`;
    document.getElementById('cart-total').innerText = `₹${total.toFixed(2)}`;
}

function openCheckoutModal() {
    if(cart.length === 0) {
        showToast("Cart is empty!");
        return;
    }
    document.getElementById('checkout-modal').classList.remove('hidden');
}

async function processCheckout(e) {
    e.preventDefault();
    const name = document.getElementById('cust-name').value;
    const phone = document.getElementById('cust-phone').value;
    const method = document.getElementById('pay-method').value;
    
    const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    const payload = {
        customerName: name,
        customerPhone: phone,
        total: total,
        paymentMethod: method,
        items: cart
    };

    try {
        const res = await fetch(`${API_URL}/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if(res.ok) {
            const saleData = await res.json();
            generateReceiptUI(saleData, name, phone, method, cart, subtotal, tax, total);
            cart = []; renderCart(); closeModal('checkout-modal');
            document.getElementById('checkout-form').reset();
            showToast("Order Placed Successfully!");
        }
    } catch (err) {
        showToast("Checkout Failed");
    }
}

// --- INVENTORY LOGIC ---
const fileInput = document.getElementById('prod-img-input');
const previewImg = document.getElementById('preview-img');
const previewPlaceholder = document.getElementById('preview-placeholder');

// Listen for file selection (Frontend Preview)
fileInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImg.src = e.target.result;
            previewImg.style.display = 'block';
            previewPlaceholder.style.display = 'none';
        }
        reader.readAsDataURL(file);
    }
});

async function saveProduct() {
    const form = document.getElementById('product-form');
    const formData = new FormData();
    
    formData.append('name', document.getElementById('prod-name').value);
    formData.append('category', document.getElementById('prod-cat').value);
    formData.append('price', document.getElementById('prod-price').value);
    formData.append('stock', document.getElementById('prod-stock').value);
    
    const fileInput = document.getElementById('prod-img-input');
    if(fileInput.files.length > 0) {
        formData.append('image', fileInput.files[0]);
    }

    let url = `${API_URL}/products`;
    let method = 'POST';

    if(currentEditId) {
        url = `${API_URL}/products/${currentEditId}`;
        method = 'PUT';
    }

    try {
        const res = await fetch(url, {
            method: method,
            body: formData
        });

        if(res.ok) {
            showToast(currentEditId ? "Product updated!" : "Product added!");
            closeModal('product-modal');
            fetchProducts();
        } else {
            showToast("Error saving product");
        }
    } catch (err) {
        console.error(err);
        showToast("Network Error");
    }
}

function openProductModal(id = null) {
    currentEditId = id;
    const modalTitle = document.getElementById('prod-modal-title');
    const form = document.getElementById('product-form');
    
    // Reset Preview
    fileInput.value = "";
    previewImg.style.display = 'none';
    previewPlaceholder.style.display = 'block';

    if(id) {
        const p = products.find(x => x.id === id);
        modalTitle.innerText = "Edit Product";
        document.getElementById('prod-id').value = p.id;
        document.getElementById('prod-name').value = p.name;
        document.getElementById('prod-cat').value = p.category;
        document.getElementById('prod-price').value = p.price;
        document.getElementById('prod-stock').value = p.stock;
        
        // Show existing image in preview
        if(p.img) {
            previewImg.src = p.img;
            previewImg.style.display = 'block';
            previewPlaceholder.style.display = 'none';
        }
    } else {
        modalTitle.innerText = "Add Product";
        form.reset();
        document.getElementById('prod-id').value = '';
    }
    document.getElementById('product-modal').classList.remove('hidden');
}

async function deleteProduct(id) {
    if(confirm("Are you sure?")) {
        await fetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
        fetchProducts();
    }
}

// --- RECEIPT UI GENERATOR ---
function generateReceiptUI(saleData, custName, phone, method, items, sub, tax, total) {
    document.getElementById('bill-inv').innerText = saleData.invoiceId;
    document.getElementById('bill-date').innerText = new Date(saleData.date).toLocaleString();
    document.getElementById('bill-cust').innerText = custName;
    document.getElementById('bill-phone').innerText = phone;
    
    let itemsHtml = '';
    items.forEach(c => {
        itemsHtml += `
            <div class="receipt-item">
                <span>${c.name} x${c.qty}</span>
                <span>₹${(c.price * c.qty).toFixed(2)}</span>
            </div>
        `;
    });
    document.getElementById('bill-items').innerHTML = itemsHtml;
    document.getElementById('bill-sub').innerText = `₹${sub.toFixed(2)}`;
    document.getElementById('bill-tax').innerText = `₹${tax.toFixed(2)}`;
    document.getElementById('bill-total').innerText = `₹${total.toFixed(2)}`;
    document.getElementById('bill-method').innerText = method;
    
    document.getElementById('receipt-modal').classList.remove('hidden');
}

function viewReceipt(saleData) {
    generateReceiptUI(
        saleData, 
        saleData.customerName, 
        saleData.customerPhone, 
        saleData.paymentMethod, 
        saleData.items, 
        saleData.subtotal || saleData.total * 0.95, // Assuming calc if subtotal not sent
        saleData.total * 0.05, 
        saleData.total
    );
}

// --- UTILS ---
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function printReceipt() {
    window.print();
}