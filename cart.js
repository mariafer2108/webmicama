(function () {
  function slugify(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '')
      .trim();
  }

  const STORAGE_KEY = 'cart';

  function getCart() {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      // Cache-bust de imágenes públicas de Supabase ya guardadas
      const now = Date.now();
      return Array.isArray(list) ? list.map(it => {
        try {
          const url = String(it.image || '');
          if (/\/storage\/v1\/object\/public\//i.test(url)) {
            it.image = url + (url.includes('?') ? `&t=${now}` : `?t=${now}`);
          }
        } catch {}
        return it;
      }) : [];
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }

  function keyFor(item) {
    return [item.name, item.category, item.measure].map(slugify).join(':');
  }

  function addToCart(rawItem, qty = 1) {
    const item = {
      id: rawItem.id,
      name: rawItem.name,
      category: rawItem.category,
      price: Number(rawItem.price) || 0,
      image: rawItem.image,
      measure: rawItem.measure || '',
    };
    const cart = getCart();
    const key = keyFor(item);
    const existing = cart.find((c) => c.key === key);
    if (existing) {
      existing.qty = Math.min(99, (existing.qty || 1) + qty);
    } else {
      cart.push({ key, ...item, qty: qty });
    }
    saveCart(cart);
    return cart;
  }

  function removeFromCart(key) {
    const cart = getCart().filter((c) => c.key !== key);
    saveCart(cart);
    return cart;
  }

  function updateQty(key, qty) {
    const cart = getCart();
    const item = cart.find((c) => c.key === key);
    if (item) {
      item.qty = Math.max(1, Math.min(99, Number(qty) || 1));
      saveCart(cart);
    }
    return cart;
  }

  function totals(cart) {
    const subtotal = cart.reduce((acc, it) => acc + (it.price * it.qty), 0);
    const count = cart.reduce((acc, it) => acc + it.qty, 0);
    return { subtotal, count };
  }

  function formatCLP(n) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n || 0);
  }

  // Delegación: botón "Agregar al carrito"
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-add-to-cart]');
    if (!btn) return;
    const item = {
      name: btn.dataset.name,
      category: btn.dataset.category,
      price: Number(btn.dataset.price) || 0,
      image: btn.dataset.image,
      measure: btn.dataset.measure || '',
    };
    addToCart(item, 1);
    btn.textContent = 'Agregado ✓';
    setTimeout(() => (btn.textContent = 'Agregar al carrito'), 1200);
  });

  window.Cart = { getCart, saveCart, addToCart, removeFromCart, updateQty, totals, formatCLP };

  // Botón flotante de carrito para móviles (se inyecta en todas las páginas)
  document.addEventListener('DOMContentLoaded', () => {
    // Evitar duplicados si ya existe
    if (document.querySelector('.floating-cart')) return;

    const btn = document.createElement('a');
    btn.className = 'floating-cart';
    btn.href = 'carrito.html';
    btn.setAttribute('aria-label', 'Abrir carrito');
    btn.innerHTML = '<i class="fa-solid fa-cart-shopping"></i>';
    document.body.appendChild(btn);
  });
})();