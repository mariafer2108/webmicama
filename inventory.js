const INVENTORY_ENDPOINTS = [ 
  'https://mi-cama-inventario-git-main-marias-projects-3a8135ab.vercel.app/api/inventory',
  'https://mi-cama-inventario-git-main-marias-projects-3a8135ab.vercel.app/api/products',
  'https://mi-cama-inventario-git-main-marias-projects-3a8135ab.vercel.app/inventory.json',
  'https://mi-cama-inventario-git-main-marias-projects-3a8135ab.vercel.app/',
];
const ALL_ORIGINS = 'https://api.allorigins.win/raw?url=';

const SUPABASE_URL = 'https://qnonqdoezynoimiydyaa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFub25xZG9lenlub2ltaXlkeWFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3MTY1NzksImV4cCI6MjA2ODI5MjU3OX0.xrG0xMAQaEWQvPRnAN1-geSzGlcGy7iWyi0QLXSq04Q';
const IMAGES_BUCKET = 'imagenes';

// --- Utilidades ---
function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function fetchJsonSmart(url) {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error(`No-JSON: ${ct}`);
    return await res.json();
  } catch {
    try {
      const proxied = ALL_ORIGINS + encodeURIComponent(url);
      const res2 = await fetch(proxied, { headers: { accept: 'application/json' } });
      if (!res2.ok) throw new Error(`Proxy status ${res2.status}`);
      return JSON.parse(await res2.text());
    } catch (e2) {
      console.log(`❌ Falló ${url}:`, e2.message);
      return null;
    }
  }
}

// --- Supabase ---
function initSupabase() {
  if (!window.supabase) {
    console.log('⚠️ SDK de Supabase no cargado (CDN)');
    return null;
  }
  try {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.log('❌ Error creando cliente Supabase:', e.message);
    return null;
  }
}

async function fetchInventory(categoryName) {
  const client = initSupabase();
  if (client) {
    try {
      // 1) Traer TODO y filtrar en cliente (evita mismatches por singular/plural/acentos)
      const { data: allData, error: allErr } = await client
        .from('inventory')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!allErr && Array.isArray(allData) && allData.length) {
        console.log(`✅ Supabase SDK (all): ${allData.length} filas`);
        const wanted = slugify(categoryName || '');
        if (wanted) {
          const filtered = allData.filter(it => {
            const cat = slugify(it?.categoria || it?.category || '');
            const name = slugify(it?.nombre || it?.name || '');
            return cat.includes(wanted) || name.includes(wanted);
          });
          if (filtered.length) {
            return filtered;
          }
          console.log('ℹ️ Supabase all filtrado vacío, se devuelve todo');
        }
        return allData;
      }

      // 2) Si falló traer todo, intentar consulta con ilike (por si allData no estuvo disponible)
      let query = client.from('inventory').select('*').order('created_at', { ascending: false }).limit(1000);
      if (categoryName) query = query.ilike('categoria', `%${categoryName}%`);
      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length) {
        console.log(`✅ Supabase SDK (ilike): ${data.length} filas`);
        return data;
      }
      if (error) {
        console.log('❌ Supabase SDK error:', error.message);
      } else {
        console.log('ℹ️ Supabase vacío, aplicando fallback');
      }
    } catch (e) {
      console.log('💥 Supabase SDK exception:', e.message);
    }
  }

  // Fallback 1: endpoints remotos (con proxy si es necesario)
  const wanted = slugify(categoryName || '');
  for (const url of INVENTORY_ENDPOINTS) {
    try {
      const j = await withTimeout(fetchJsonSmart(url), 8000);
      const arr = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : null);
      if (Array.isArray(arr) && arr.length) {
        console.log(`✅ Fallback endpoint: ${url} → ${arr.length} filas`);
        if (wanted) {
          return arr.filter(it => {
            const cat = slugify(it?.categoria || it?.category || '');
            const name = slugify(it?.nombre || it?.name || '');
            return cat.includes(wanted) || name.includes(wanted);
          });
        }
        return arr;
      }
    } catch (e) {
      console.log(`❌ Fallback endpoint falló ${url}:`, e.message);
    }
  }

  // Fallback 2: inventario local del mismo origen
  try {
    const r = await withTimeout(fetch('inventario.json', { headers: { accept: 'application/json' } }), 8000);
    if (r.ok) {
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
      if (arr.length) {
        console.log(`✅ Fallback local inventario.json: ${arr.length} filas`);
        if (wanted) {
          return arr.filter(it => {
            const cat = slugify(it?.categoria || it?.category || '');
            const name = slugify(it?.nombre || it?.name || '');
            return cat.includes(wanted) || name.includes(wanted);
          });
        }
        return arr;
      }
    }
  } catch (e) {
    console.log('❌ Fallback local inventario.json falló:', e.message);
  }

  // Último recurso
  return [];
}

// Helpers
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

// NUEVO: muestra '1 1/2' en vez de '1.5' en el UI
function toDisplayMeasure(txt) {
  return String(txt || '').replace(/1\.5/g, '1 1/2');
}

// Normaliza alias de medida a una clave canónica: m-1, m-15, m-2, m-king, m-superking
function normalizeMeasureAlias(input) {
  const raw = String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const s = raw
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/½/g, '1/2')
    .replace(/1\s*,\s*5/g, '1.5')
    .trim();

  if (!s) return '';

  // Super King / King
  if (/super\s*king/.test(s)) return 'm-superking';
  if (/\bking\b/.test(s)) return 'm-king';

  // Plaza y media (siempre con contexto de 'plaza' o frase equivalente)
  if (/plaz(a|as)?\s*y\s*media/.test(s)) return 'm-15';
  if (/1\s*(?:1\/2|½)\s*plaz(a|as)?/.test(s)) return 'm-15';
  if (/\b1\.5\b.*plaz(a|as)?/.test(s)) return 'm-15';

  // 2 Plazas (requiere 'plaza')
  if (/2\s*plaz(a|as)?/.test(s) || (/\b2\b/.test(s) && /plaz(a|as)?/.test(s))) return 'm-2';

  // 1 Plaza (requiere 'plaza')
  if (/1\s*plaz(a|as)?/.test(s) || (/\b1\b/.test(s) && /plaz(a|as)?/.test(s))) return 'm-1';

  // Sin contexto de 'plaza' o 'king', no devolvemos alias para evitar falsos positivos
  return '';
}

// Extrae posibles medidas canónicas desde el item
function itemMeasureTokens(it) {
  const set = new Set();
  const candidates = [
    it && it.measure,
    it && it.size,
    it && it.tamano,
  ];
  for (const c of candidates) {
    const alias = normalizeMeasureAlias(c);
    if (alias) set.add(alias);
  }
  return set;
}

function imageFallbackByCategory(category) {
  const slug = slugify(category);
  const map = {
    almohadas: 'img/almohadas.JPG',
    sabanas: 'img/sabana.JPG',
    toallas: 'img/toallas.JPG',
    quilt: 'img/quilt.JPG',
    plumones: 'img/cobertor.JPG',
    infantil: 'img/infantil.JPG',
    frazadas: 'img/frazada.JPG',
    protectores: 'img/protector.JPG',
  };
  return map[slug] || 'img/inicio.jpg';
}

function formatPrice(n) {
  const val = Number(n) || 0;
  if (window.Cart && typeof window.Cart.formatCLP === 'function') {
    return window.Cart.formatCLP(val);
  }
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);
  } catch {
    return `$${val}`;
  }
}

// Resuelve una URL de imagen robustamente (string, array, objeto; local o Supabase bucket)
function coerceImageUrl(raw, category) {
  const pickString = (val, depth = 0) => {
    if (typeof val === 'string' && val.trim()) return val;
    if (depth > 3 || val == null) return undefined;
    if (Array.isArray(val)) {
      for (const v of val) {
        const found = pickString(v, depth + 1);
        if (found) return found;
      }
    } else if (typeof val === 'object') {
      const preferred = ['imagen', 'image', 'url', 'src'];
      for (const key of preferred) {
        if (typeof val[key] === 'string' && val[key].trim()) return val[key];
      }
      for (const v of Object.values(val)) {
        const found = pickString(v, depth + 1);
        if (found) return found;
      }
    }
    return undefined;
  };

  let candidate = pickString(raw);
  if (!candidate) return imageFallbackByCategory(category);

  let clean = String(candidate)
    .replace(/[\`"'“”‘’]/g, '')
    .replace(/\u200B/g, '')
    .replace(/\\/g, '/')
    .trim()
    .replace(/\.jpgg(?=[?#]|$)/i, '.jpg');

  if (!clean) return imageFallbackByCategory(category);

  const isHttp = /^https?:\/\//i.test(clean);

  // Helper: añade bust a URLs de Supabase Storage
  const addBust = (url) => {
    const ts = Date.now(); // bust inmediato
    return url + (url.includes('?') ? `&t=${ts}` : `?t=${ts}`);
  };
  const isSupabase = (url) =>
    /\/storage\/v1\/object\/public\//i.test(url) ||
    new RegExp(`^https?://[^/]*${SUPABASE_URL.replace('https://','').replace(/\./g,'\\.')}/`).test(url);

  if (isHttp) {
    // Si es una URL absoluta y apunta a Supabase, añade bust
    return isSupabase(clean) ? addBust(clean) : clean;
  }

  const encodeSegments = (p) => p.split('/').map(s => encodeURIComponent(s)).join('/');
  const bucket = typeof IMAGES_BUCKET === 'string' && IMAGES_BUCKET.trim() ? IMAGES_BUCKET.trim() : 'imagenes';

  // Local img/...
  if (/^(?:\.\/)?img\/|^\/img\//i.test(clean)) {
    const path = clean.replace(/^\.\//, '').replace(/^\/+/, '');
    return encodeSegments(path);
  }

  // Ya viene como public storage
  if (/\/storage\/v1\/object\/public\//i.test(clean)) {
    return addBust(clean);
  }

  // Ruta de bucket imagenes/...
  const isBucketPath = new RegExp(`^(?:\\./)?${bucket}/|^/${bucket}/`, 'i').test(clean);
  if (isBucketPath) {
    const path = clean.replace(/^\.\//, '').replace(/^\/+/, '');
    const base = `${SUPABASE_URL}/storage/v1/object/public/${encodeSegments(path)}`;
    return addBust(base);
  }

  const hasExt = /\.(jpg|jpeg|png|gif|webp)$/i.test(clean);

  // NUEVO: ruta relativa con subcarpetas (ej: "sabanas/300hilos.jpg") → asumir bucket por defecto
  const looksRelativeBucketAsset =
    hasExt &&
    /[\/\\]/.test(clean) &&
    !/^(\.\/|\/|img\/|https?:\/\/)/i.test(clean);
  if (looksRelativeBucketAsset) {
    const path = `${bucket}/${clean}`.replace(/\\/g, '/');
    const base = `${SUPABASE_URL}/storage/v1/object/public/${encodeSegments(path)}`;
    return addBust(base);
  }

  // Nombre de archivo suelto → en bucket por defecto
  if (hasExt && !clean.includes('/')) {
    const base = `${SUPABASE_URL}/storage/v1/object/public/${encodeSegments(`${bucket}/${clean}`)}`;
    return addBust(base);
  }

  return imageFallbackByCategory(category);
}

// Detección de infantil por edad/nombre/tags
function matchesInfantil(item) {
  const cat = slugify(item.category);
  if (cat.includes('infantil')) return true;

  const ageText = slugify(item.age || '');
  if (ageText) return true;

  const name = slugify(item.name);
  if (
    name.includes('infantil') ||
    name.includes('nina') ||
    name.includes('nino') ||
    name.includes('bebe') ||
    name.includes('baby') ||
    name.includes('juvenil') ||
    name.includes('kids')
  ) return true;

  const tagList = Array.isArray(item.tags) ? item.tags.map(slugify) : [];
  if (tagList.some((t) =>
    ['infantil', 'nina', 'nino', 'bebe', 'baby', 'juvenil', 'kids'].some((k) => t.includes(k))
  )) return true;

  return false;
}

// Detecta la medida desde query, data-atributo o archivo medida-*.html
function resolveMeasure() {
  try {
    // 1) Query string (?measure=...)
    const qs = new URLSearchParams(location.search);
    const q = (qs.get('measure') || '').trim();
    if (q) {
      return (typeof toDisplayMeasure === 'function') ? toDisplayMeasure(q) : q;
    }

    // 2) data-measure en el DOM
    const dataEl = document.querySelector('[data-measure]');
    const dm = (dataEl?.dataset?.measure || '').trim();
    if (dm) {
      return (typeof toDisplayMeasure === 'function') ? toDisplayMeasure(dm) : dm;
    }

    // 3) nombre de archivo medida-*.html
    const path = (location.pathname || '').toLowerCase();
    const file = (path.split('/').pop() || '').replace('.html', '').trim();
    const map = {
      'medida-1-plaza': '1 Plaza',
      'medida-1-5-plaza': '1 1/2 Plaza',
      'medida-2-plazas': '2 Plazas',
      'medida-king': 'King',
      'medida-super-king': 'Super King',
    };
    return map[file] || '';
  } catch {
    return '';
  }
}

// Reemplazo: normalizador de ítems correcto
function normalizeItem(raw) {
  const name = raw?.nombre || raw?.name || '(Sin nombre)';
  const category = raw?.categoria || raw?.category || 'General';
  const price = Number(
    raw?.precio ??
    raw?.price ??
    raw?.precioventa ??
    raw?.precio_venta
  ) || null;
  const measure = raw?.medida || raw?.tamaño || raw?.tamano || raw?.measure || '';
  const description = raw?.descripcion || raw?.description || '';

  const imageRaw =
    raw?.imagen ?? raw?.image ?? raw?.img ?? raw?.foto ?? raw?.image_url ?? raw?.url ?? raw?.imagenes ?? raw?.images;
  const image = coerceImageUrl(imageRaw, category);

  const age =
    raw?.edad ||
    raw?.age ||
    raw?.rangoEdad ||
    raw?.segmento ||
    raw?.grupo ||
    '';
  const tags = Array.isArray(raw?.tags)
    ? raw.tags
    : Array.isArray(raw?.etiquetas)
    ? raw.etiquetas
    : [];
  const id = raw?.id ?? raw?.codigo ?? raw?.sku ?? null;

  return { id, name, category, price, measure, description, image, age, tags };
}

// Tarjeta de producto
function renderCard(item) {
  const priceHtml = item.price != null
    ? `<div class="price">${formatPrice(item.price)}</div>`
    : '';
  const esc = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const measureLabel = toDisplayMeasure(item.measure);
  const key = computeItemKey(item);
  const detailHref = item.id != null
    ? `producto.html?id=${encodeURIComponent(String(item.id))}`
    : `producto.html?key=${encodeURIComponent(key)}&name=${encodeURIComponent(item.name)}&measure=${encodeURIComponent(item.measure || '')}`;

  return `
    <article class="product-card">
      <a href="${detailHref}">
        <img src="${esc(item.image)}" alt="${esc(item.name)}" />
      </a>
      <h3><a href="${detailHref}">${esc(item.name)}</a></h3>
      ${priceHtml}
      ${item.measure ? `<p><strong>Tamaño:</strong> ${esc(measureLabel)}</p>` : ''}
      <button class="btn btn-primary"
        data-add-to-cart
        data-name="${esc(item.name)}"
        data-category="${esc(item.category)}"
        data-price="${item.price != null ? item.price : 0}"
        data-image="${esc(item.image)}"
        data-measure="${esc(item.measure || '')}">
        Agregar al carrito
      </button>
    </article>
  `;
}

// Render de la grilla con fallbacks
async function renderCategoryProducts() {
  const titleEl = document.querySelector('.hero-card h1');
  let grid = document.querySelector('.product-grid');
  if (!grid) {
    const main = document.querySelector('main') || document.body;
    const created = document.createElement('section');
    created.className = 'product-grid';
    main.appendChild(created);
    grid = created;
  }
  // Preservar contenido estático original para fallback visual
  const originalGridHTML = grid.innerHTML;

  const categoryName = (() => {
    const dataEl = document.querySelector('[data-category]');
    if (dataEl?.dataset?.category) return dataEl.dataset.category.trim();
    if (titleEl?.textContent) return titleEl.textContent.trim();
    const path = (location.pathname || '').toLowerCase();
    const file = path.split('/').pop() || '';
    const base = file.replace('.html', '').trim();
    const map = {
      almohadas: 'Almohadas',
      sabanas: 'Sábanas',
      toallas: 'Toallas',
      quilt: 'Quilt',
      plumones: 'Plumones',
      infantil: 'Infantil',
      frazadas: 'Frazadas',
      protectores: 'Protectores',
    };
    return map[base] || '';
  })();

  // Permitir limpieza de caché local
  try {
    const qs = new URLSearchParams(location.search);
    if (qs.get('fresh') === '1') {
      localStorage.removeItem('inventory.cache');
    }
  } catch {}

  // Medida activa (si aplica)
  const measureName = resolveMeasure();
  const hasMeasure = !!slugify(measureName) || !!normalizeMeasureAlias(measureName);

  try {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      if (hasMeasure) {
        mainEl.classList.add('is-fullwidth');
      } else {
        mainEl.classList.remove('is-fullwidth');
      }
    }
  } catch {}

  const slugCat = slugify(categoryName);
  const allowed = ['almohadas','sabanas','toallas','quilt','plumones','infantil','frazadas','protectores'];
  if (!slugCat || !allowed.includes(slugCat)) {
    if (!hasMeasure) {
      console.log('↩️ Página sin categoría y sin medida: no se cargan productos');
      return;
    }
    console.log('🧭 Página de medidas:', measureName, '→ se cargan productos filtrando por medida');
  }

  console.log('🧭 Categoría detectada:', categoryName || '(sin categoría)');
  grid.innerHTML = `
    <article class="product-card">
      <img src="${imageFallbackByCategory(categoryName || 'Productos')}" alt="Cargando..." />
      <h3>Cargando productos...</h3>
    </article>
  `;

  try {
    // Traer inventario (Supabase → endpoints → inventario.json)
    const res = await withTimeout(fetchInventory(null), 12000);

    const items = Array.isArray(res) ? res.map(normalizeItem) : [];

    // Guardar cache para producto.html
    try {
      localStorage.setItem('inventory.cache', JSON.stringify({ savedAt: Date.now(), items }));
    } catch {}

    const filtered = Array.isArray(items) ? items.filter(it => {
      // Filtro por categoría
      let okCat;
      if (!allowed.includes(slugCat) || !slugCat) {
        okCat = true;
      } else {
        const detected = detectCategorySlug(it);
        const catEq = slugify(it.category) === slugCat;
        okCat = detected === slugCat || catEq;
      }
      if (!okCat) return false;

      // Filtro por medida
      if (hasMeasure) {
        return matchesMeasure(it, measureName);
      }
      return true;
    }) : [];

    // Sin resultados → mantener contenido original estático
    if (!filtered.length) {
      grid.innerHTML = originalGridHTML || '';
      grid.style.display = originalGridHTML ? '' : 'none';
      return;
    }

    if (!hasMeasure && allowed.includes(slugCat)) {
      grid.innerHTML = filtered.map(renderCard).join('');
    } else if (hasMeasure) {
      const titleMap = {
        almohadas: 'Almohadas',
        sabanas: 'Sábanas',
        toallas: 'Toallas',
        quilt: 'Quilt',
        plumones: 'Plumones',
        infantil: 'Infantil',
        frazadas: 'Frazadas',
        protectores: 'Protectores',
      };
      const groups = new Map();
      for (const it of filtered) {
        const slug = detectCategorySlug(it) || slugify(it.category) || 'otros';
        const key = slugify(slug);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(it);
      }
      const entries = Array.from(groups.entries()).sort((a,b) => b[1].length - a[1].length);
      const columns = [];
      for (const [k, list] of entries) {
        const title = titleMap[k] || (k.charAt(0).toUpperCase() + k.slice(1));
        const cards = list.map(renderCard).join('');
        columns.push(`<div class="category-column"><div class="product-grid--column">${cards}</div></div>`);
      }
      grid.innerHTML = `<section class="category-columns">${columns.join('')}</section>`;
    } else {
      grid.innerHTML = filtered.map(renderCard).join('');
    }
  } catch (err) {
    console.log('💥 Error al renderizar:', err);
    grid.innerHTML = `
      <article class="product-card">
        <img src="${imageFallbackByCategory(categoryName || 'Productos')}" alt="${categoryName || 'Productos'}" />
        <h3>Problema al cargar productos</h3>
        <p>${String(err && err.message || err)}</p>
      </article>
    `;
  }
}

// Inicializar en carga del documento
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderCategoryProducts);
} else {
  renderCategoryProducts();
}

// Home: renderizar productos destacados reales en index.html
async function renderFeaturedProductsOnHome() {
  try {
    const path = (location.pathname || '').toLowerCase();
    const file = (path.split('/').pop() || '').trim();
    if (file && file !== 'index.html') return;

    const grid = document.querySelector('.featured .product-grid');
    if (!grid) return;

    let cfg = {};
    try {
      const cfgEl = document.getElementById('featured-config');
      if (cfgEl) cfg = JSON.parse(cfgEl.textContent || '{}');
    } catch {}

    grid.innerHTML = `
      <article class="product-card">
        <h3>Cargando productos...</h3>
      </article>
    `;

    const res = await withTimeout(fetchInventory(null), 12000);
    const items = Array.isArray(res) ? res.map(normalizeItem) : [];

    // Selección explícita por config: ids / names / keys
    const cfgIds = new Set((cfg.ids || []).map((v) => String(v)));
    const cfgNames = new Set((cfg.names || []).map((v) => slugify(v)));
    const cfgKeys = new Set((cfg.keys || []).map((v) => slugify(v)));
    let featured = [];
    if (cfgIds.size || cfgNames.size || cfgKeys.size) {
      featured = items.filter((it) => {
        const byId = it.id != null && cfgIds.has(String(it.id));
        const byName = cfgNames.has(slugify(it.name));
        const byKey = cfgKeys.has(slugify(computeItemKey(it)));
        return byId || byName || byKey;
      });
    }

    // Si no hay selección en config, preferir tags 'destacado'/'featured'
    if (!featured.length) {
      featured = items.filter((it) => {
        const tags = Array.isArray(it.tags) ? it.tags.map(slugify) : [];
        return tags.some((t) => t.includes('destacado') || t.includes('featured'));
      });
    }

    // Fallback: tomar los más recientes de categorías conocidas
    if (!featured.length) {
      const allowed = ['almohadas','sabanas','toallas','quilt','plumones','infantil','frazadas','protectores'];
      featured = items.filter((it) => allowed.includes(slugify(it.category)));
    }

    const limit = Number(cfg.limit) || 3;
    const top = featured.slice(0, limit);
    grid.innerHTML = top.map(renderCard).join('');
  } catch (e) {
    console.log('💥 Error al renderizar destacados:', e && e.message ? e.message : e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderFeaturedProductsOnHome);
} else {
  renderFeaturedProductsOnHome();
}

// Coincidencia estricta por medida
function matchesMeasure(item, measureName) {
  const want = normalizeMeasureAlias(measureName);
  if (!want) return false;
  const mine = normalizeMeasureAlias(item.measure || '');
  return !!mine && mine === want;
}

// Detecta la categoría del item en formato slug conocido
function detectCategorySlug(item) {
  const allowed = ['almohadas','sabanas','toallas','quilt','plumones','infantil','frazadas','protectores'];
  const cat = slugify(item.category);
  if (allowed.includes(cat)) return cat;
  if (matchesInfantil(item)) return 'infantil';

  const name = slugify(item.name);
  const tags = Array.isArray(item.tags) ? item.tags.map(slugify) : [];

  const synonyms = {
    protectores: ['protector','colchon','colchonera','cubrecolchon','cubrecolch','cubre','cubrematelas','cubrecolchoneta'],
    sabanas: ['sabana','sabanas'],
    quilt: ['quilt','cobertor','acolchado','cubrelecho','cubrecama'],
    plumones: ['plumon','edredon','duvet'],
    almohadas: ['almohada','cojin','cojines'],
    toallas: ['toalla','toallas'],
    frazadas: ['frazada','manta','mantas','polar'],
  };

  const textMatches = (text, keys) => keys.some(k => text.includes(k));
  for (const [slug, keys] of Object.entries(synonyms)) {
    if (textMatches(cat, keys) || textMatches(name, keys) || tags.some(t => textMatches(t, keys))) {
      return slug;
    }
  }
  for (const slug of allowed) {
    if (cat.includes(slug) || name.includes(slug) || tags.some(t => t.includes(slug))) {
      return slug;
    }
  }
  return slugify(item.category) || 'productos';
}

// Clave única para detalles
function computeItemKey(item) {
  return [item.name, item.category, item.measure].map(slugify).join(':');
}

function resolveSearchTarget(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const m = normalizeMeasureAlias(s);
  if (m) {
    if (m === 'm-1') return 'medida-1-plaza.html';
    if (m === 'm-15') return 'medida-1-5-plaza.html';
    if (m === 'm-2') return 'medida-2-plazas.html';
    if (m === 'm-king') return 'medida-king.html';
    if (m === 'm-superking') return 'medida-super-king.html';
  }
  const raw = s.toLowerCase();
  if (/\b1\.5\b/.test(raw) || /\b1\s*(?:1\/2|½)\b/.test(raw)) return 'medida-1-5-plaza.html';
  if (/\bking\b/.test(raw)) return 'medida-king.html';
  if (/super\s*king/.test(raw)) return 'medida-super-king.html';
  const fake = { name: s, category: s, tags: [s] };
  const cat = detectCategorySlug(fake);
  const allowed = ['almohadas','sabanas','toallas','quilt','plumones','infantil','frazadas','protectores'];
  if (allowed.includes(cat)) return `${cat}.html`;
  return null;
}

function setupProductosSearch() {
  const bar = document.querySelector('.searchbar');
  if (!bar) return;
  const input = bar.querySelector('input');
  const btn = bar.querySelector('.search-btn');
  const go = (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const target = resolveSearchTarget(input && input.value);
    if (target) location.href = target;
  };
  if (btn) btn.addEventListener('click', go);
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupProductosSearch);
} else {
  setupProductosSearch();
}
